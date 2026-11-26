"""
Wandelt ein Character-Creator-Modell (FBX, CC3+ Skelett) in das kompakte Format der Fitness-App um.

- behält Körper, Augen, Kleidung (Unterwäsche) und Haare, entfernt Wimpern, Zähne, Zunge, Hilfsgeometrie
- fasst das CC-Skelett auf die Gelenke der App zusammen (4 Einflüsse je Vertex)
- übernimmt die Farben der Texturen als Vertex-Farben (Haut, Kleidung, Haare, Augen)
- berechnet Muskelmasken je Vertex (für das Einfärben der trainierten Muskeln)

Aufruf (in Blender, ohne Oberfläche):
  blender -b --factory-startup -P cc_convert.py -- <modell.fbx> <out_dir> <name> <male|female>
"""
import sys
import json
import bpy
import numpy as np

fbx, out_dir, out_name, gender = sys.argv[sys.argv.index('--') + 1:][:4]
HIP_Y = 0.93  # Hüftgelenk auf gleiche Höhe wie beim bisherigen Modell, damit Posen und Geräte passen

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx)
arm = bpy.data.objects['CC3_Base_Plus']
arm.data.pose_position = 'REST'
bpy.context.view_layer.update()

# Teile: 0 Haut, 1 Augen, 2 Kleidung, 3 Haare/Augenbrauen (Female_Angled = Augenbrauen)
PARTS = {'CC_Base_Body': 0, 'CC_Game_Eye': 1, 'Bra': 2, 'Underwear_Bottoms': 2, 'Boxers': 2, 'Female_Angled': 3}
DROP_MATS = {'Std_Eyelash', 'Std_Nails_', 'Female_Angled_Base_Transparency'}
HAIR_RGB = (0.20, 0.14, 0.10)  # Augenbrauen: Textur ist größtenteils transparent, daher feste Farbe (sRGB)

# Blender (Z oben, Blick -Y) -> App (Y oben, Blick +Z)
def to_app(v):
    v = np.asarray(v, dtype=np.float64)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], -1)


def img_array(im):
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


img_cache = {}


def diffuse_of(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            inp = n.inputs[0]
            if inp.is_linked:
                src = inp.links[0].from_node
                if src.type == 'TEX_IMAGE' and src.image:
                    if src.image.name not in img_cache:
                        img_cache[src.image.name] = img_array(src.image)
                    return img_cache[src.image.name]
            c = inp.default_value
            return np.array([[list(c)]], dtype=np.float32)
    return None


bone_names = [b.name for b in arm.data.bones]
P_all, T_all, part_all, col_all, W_all = [], [], [], [], []
off = 0
for obj in bpy.data.objects:
    if obj.type != 'MESH' or obj.name not in PARTS:
        continue
    me = obj.data
    mw = np.array(obj.matrix_world)
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    co = co @ mw[:3, :3].T + mw[:3, 3]
    # Farben: Textur an den UVs der Ecken abtasten, je Vertex mitteln
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    acc = np.zeros((n, 3)); cnt = np.zeros(n)
    tris = []
    me.calc_loop_triangles()
    for lt in me.loop_triangles:
        mat = me.materials[lt.material_index] if me.materials else None
        if mat and any(mat.name.startswith(d) for d in DROP_MATS):
            continue
        tris.append(tuple(lt.vertices))
        img = diffuse_of(mat)
        if img is None:
            continue
        h, w = img.shape[:2]
        for li, vi in zip(lt.loops, lt.vertices):
            if uv is not None and (h > 1 or w > 1):
                u, v = uv[li].uv
                px = img[int((v % 1) * (h - 1)), int((u % 1) * (w - 1))]
            else:
                px = img[0, 0]
            acc[vi] += px[:3]; cnt[vi] += 1
    col = acc / np.maximum(cnt, 1)[:, None]
    # Gewichte je CC-Knochen
    gi = {g.index: g.name for g in obj.vertex_groups}
    Wb = np.zeros((n, len(bone_names)))
    for v in me.vertices:
        for g in v.groups:
            nm = gi.get(g.group)
            if nm in bone_names:
                Wb[v.index, bone_names.index(nm)] += g.weight
    if obj.parent_type == 'BONE' or Wb.sum() == 0:
        Wb[:, bone_names.index('CC_Base_Head')] = 1
    P_all.append(co); T_all.append(np.array(tris, dtype=np.int64) + off)
    part_all.append(np.full(n, PARTS[obj.name])); col_all.append(col); W_all.append(Wb)
    off += n
    print('mesh', obj.name, n, len(tris))

P = to_app(np.concatenate(P_all))
tris = np.concatenate(T_all)
part_v = np.concatenate(part_all)
COL = np.concatenate(col_all)
WB = np.concatenate(W_all)
used = np.unique(tris)
N = len(P)

# Füße auf y = 0
P[:, 1] -= P[used, 1].min()
SCALE = 1.0

amw = np.array(arm.matrix_world)


def bpos(name, end='head'):
    b = arm.data.bones[name]
    v = np.array(getattr(b, 'head_local' if end == 'head' else 'tail_local'))
    v = amw[:3, :3] @ v + amw[:3, 3]
    p = to_app(v)
    p[1] -= P_shift
    return p * SCALE


P_shift = 0.0
# gleiche Verschiebung wie bei den Vertices anwenden
raw_min = to_app(np.concatenate(P_all))[used, 1].min()
P_shift = raw_min

C = 'CC_Base_'
JOINTS = [
    ('root', None, C + 'Hip'),
    ('spine', 'root', C + 'Waist'),
    ('chest', 'spine', C + 'Spine02'),
    ('neck', 'chest', C + 'NeckTwist01'),
    ('head', 'neck', C + 'Head'),
]
for s in 'LR':
    JOINTS += [
        ('scap.' + s, 'chest', C + s + '_Clavicle'),
        ('sh.' + s, 'scap.' + s, C + s + '_Upperarm'),
        ('el.' + s, 'sh.' + s, C + s + '_Forearm'),
        ('fa.' + s, 'el.' + s, None),  # Mitte des Unterarms
        ('wr.' + s, 'fa.' + s, C + s + '_Hand'),
        ('f1.' + s, 'wr.' + s, C + s + '_Mid1'),
        ('f2.' + s, 'f1.' + s, C + s + '_Mid2'),
        ('f3.' + s, 'f2.' + s, C + s + '_Mid3'),
        ('th1.' + s, 'wr.' + s, C + s + '_Thumb2'),
        ('th2.' + s, 'th1.' + s, C + s + '_Thumb3'),
        ('hp.' + s, 'root', C + s + '_Thigh'),
        ('kn.' + s, 'hp.' + s, C + s + '_Calf'),
        ('an.' + s, 'kn.' + s, C + s + '_Foot'),
        ('toe.' + s, 'an.' + s, C + s + '_ToeBase'),
    ]
jnames = [j[0] for j in JOINTS]
jpos = []
for name, _, bone in JOINTS:
    if bone is None:
        S = name[-1]
        jpos.append((bpos(C + S + '_Forearm') + bpos(C + S + '_Hand')) / 2)
    else:
        jpos.append(bpos(bone))
jpos = np.array(jpos)
hy = (jpos[jnames.index('hp.L')][1] + jpos[jnames.index('hp.R')][1]) / 2
SCALE = HIP_Y / hy
P *= SCALE
jpos *= SCALE
print('scale', round(SCALE, 4))


def group(b):
    """CC-Knochen -> App-Gelenk"""
    b = b.replace(C, '')
    s = None
    if b[:2] in ('L_', 'R_'):
        s, b = b[0], b[2:]
    if b in ('BoneRoot', 'Hip', 'Pelvis'):
        return 'root'
    if b in ('Waist', 'Spine01'):
        return 'spine'
    if b in ('Spine02', 'RibsTwist', 'Breast'):
        return 'chest'
    if b.startswith('NeckTwist'):
        return 'neck'
    if b == 'Clavicle':
        return 'scap.' + s
    if b.startswith('Upperarm'):
        return 'sh.' + s
    if b in ('Forearm', 'ElbowShareBone'):
        return 'el.' + s
    if b.startswith('ForearmTwist'):
        return 'fa.' + s
    if b in ('Hand', 'Thumb1'):
        return 'wr.' + s
    if b == 'Thumb2':
        return 'th1.' + s
    if b == 'Thumb3':
        return 'th2.' + s
    if b.startswith('ToeBase') or b.endswith('Toe1'):
        return 'toe.' + s
    for f in ('Index', 'Mid', 'Ring', 'Pinky'):
        if b.startswith(f):
            return 'f' + b[-1] + '.' + s
    if b.startswith('Thigh'):
        return 'hp.' + s
    if b.startswith('Calf') or b == 'KneeShareBone':
        return 'kn.' + s
    if b == 'Foot':
        return 'an.' + s
    return 'head'  # Kopf, Kiefer, Augen …


bmap = np.array([jnames.index(group(b)) for b in bone_names])
W = np.zeros((N, len(jnames)))
for k in range(len(bone_names)):
    W[:, bmap[k]] += WB[:, k]
eye_v = np.where(part_v == 1)[0]
W[eye_v] = 0
W[eye_v, jnames.index('head')] = 1
W[W.sum(1) == 0, jnames.index('root')] = 1
order = np.argsort(-W, axis=1)[:, :4]
top = np.take_along_axis(W, order, axis=1)
top /= np.maximum(top.sum(1, keepdims=True), 1e-9)
q = np.round(top * 255).astype(np.int64)
q[:, 0] += 255 - q.sum(1)

# ---------------- Marker (Griff, Ferse, Zehen, Nacken) ----------------
def jpo(n):
    return jpos[jnames.index(n)]


skin = part_v == 0
markers = {}
for s in 'LR':
    hand = np.where((W[:, jnames.index('wr.' + s)] + W[:, jnames.index('f1.' + s)] > 0.5) & skin)[0]
    c = P[hand].mean(0)
    markers['grip.' + s] = ('wr.' + s, (jpo('wr.' + s) * 0.35 + jpo('f1.' + s) * 0.65 + c) / 2)
    foot = np.where((W[:, jnames.index('an.' + s)] + W[:, jnames.index('toe.' + s)] > 0.5) & skin)[0]
    fp = P[foot]
    heel = fp[np.argmin(fp[:, 2])].copy(); heel[1] = fp[:, 1].min()
    toe = fp[np.argmax(fp[:, 2])].copy(); toe[1] = fp[:, 1].min()
    markers['heel.' + s] = ('an.' + s, heel)
    markers['toe.' + s] = ('toe.' + s, toe)
nk = jpo('neck')
back = P[skin & (np.abs(P[:, 0]) < 0.04) & (np.abs(P[:, 1] - (nk[1] - 0.04)) < 0.02)]
markers['traps'] = ('chest', np.array([0, nk[1] - 0.03, back[:, 2].min() - 0.03]))

# ---------------- Muskelmasken (wie im MakeHuman-Konverter) ----------------
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def w(*names):
    return sum(W[:, jnames.index(n)] for n in names)


def frame(j0, j1):
    a, b = jpo(j0), jpo(j1)
    u = (b - a) / np.linalg.norm(b - a)
    f = np.array([0, 0, 1.0]) - u[2] * u
    f /= np.linalg.norm(f)
    s = np.cross(u, f)
    return a, b, u, f, s


def ell(center, axes, radii):
    d = P - center
    qq = sum(((d @ ax) / r) ** 2 for ax, r in zip(axes, radii))
    return 1 - ss(0.55, 1.0, qq)


def limb_blob(j0, j1, t, front, side, ru, rf, rs):
    a, b, u, f, s = frame(j0, j1)
    c = a + (b - a) * t + f * front + s * side
    return ell(c, [u, f, s], [ru, rf, rs])


Y = P[:, 1]
hip_y = (jpo('hp.L')[1] + jpo('hp.R')[1]) / 2
sh_y = jpo('sh.L')[1]
ch_y = jpo('chest')[1]
torso = w('root', 'spine', 'chest', 'scap.L', 'scap.R', 'neck')
tv = P[(torso > 0.6) & skin]
EX_, EY, EZ = np.eye(3)
F = 1.0 if gender == 'male' else 0.92  # Frau: etwas kleinere Muskelbäuche
masks = {k: np.zeros(N) for k in ['chest', 'abs', 'lats', 'lowerBack', 'glutes', 'delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'calves']}


def front_z(y, x=0.0, dx=0.03):
    sel = tv[(np.abs(tv[:, 1] - y) < 0.02) & (np.abs(tv[:, 0] - x) < dx)]
    return sel[:, 2].max(), sel[:, 2].min()


abs_y = (hip_y + 0.08 + sh_y - 0.24) / 2
fz, _ = front_z(abs_y)
masks['abs'] = torso * ell(np.array([0, abs_y, fz - 0.03]), [EX_, EY, EZ], [0.075 * F, (sh_y - 0.24 - hip_y - 0.08) / 2 + 0.03, 0.06])
lb_y = hip_y + 0.13
_, bz = front_z(lb_y, 0.04)
for sgn in (1, -1):
    py = sh_y - 0.1
    fz, _ = front_z(py, 0.09 * sgn)
    masks['chest'] += torso * ell(np.array([0.085 * sgn * F, py, fz - 0.035]), [EX_, EY, EZ], [0.095 * F, 0.075, 0.06])
    _, bz2 = front_z(ch_y + 0.04, 0.11 * sgn * F)
    masks['lats'] += torso * ell(np.array([0.115 * sgn * F, ch_y + 0.02, bz2 + 0.035]), [EX_, EY, EZ], [0.075 * F, 0.15, 0.07])
    masks['lowerBack'] += torso * ell(np.array([0.035 * sgn, lb_y, bz + 0.025]), [EX_, EY, EZ], [0.04, 0.1, 0.045])
    hy = hip_y - 0.07
    sel = P[skin & (np.abs(P[:, 1] - hy) < 0.02) & (np.abs(P[:, 0] - 0.085 * sgn) < 0.03)]
    masks['glutes'] += w('root', 'hp.L', 'hp.R', 'spine') * ell(np.array([0.085 * sgn, hy, sel[:, 2].min() + 0.04]), [EX_, EY, EZ], [0.085, 0.095, 0.075])
for S, sgn in (('L', 1), ('R', -1)):
    arm_w = w('sh.' + S, 'scap.' + S)
    sh = jpo('sh.' + S)
    masks['delts'] += w('sh.' + S, 'scap.' + S, 'chest') * ell(sh + np.array([0.025 * sgn, -0.015, 0]), [EX_, EY, EZ], [0.07 * F, 0.09, 0.075 * F])
    masks['biceps'] += arm_w * limb_blob('sh.' + S, 'el.' + S, 0.58, 0.032 * F, 0, 0.12, 0.045 * F, 0.04 * F)
    masks['triceps'] += arm_w * limb_blob('sh.' + S, 'el.' + S, 0.45, -0.035 * F, 0, 0.15, 0.045 * F, 0.045 * F)
    leg = w('hp.' + S)
    masks['quads'] += leg * limb_blob('hp.' + S, 'kn.' + S, 0.52, 0.045, 0, 0.25, 0.06, 0.07)
    masks['hamstrings'] += leg * limb_blob('hp.' + S, 'kn.' + S, 0.55, -0.045, 0, 0.22, 0.05, 0.06)
    masks['calves'] += w('kn.' + S) * limb_blob('kn.' + S, 'an.' + S, 0.3, -0.03, 0, 0.15, 0.065, 0.06)

# Kleidung und Haare werden nie als Muskel eingefärbt; "shorts" = Kleidung
not_skin = part_v != 0
for k in masks:
    masks[k][not_skin] = 0
masks['shorts'] = (part_v == 2).astype(np.float64)
MKEYS = ['chest', 'abs', 'lats', 'lowerBack', 'glutes', 'delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'calves', 'shorts']
M = np.stack([np.clip(masks[k], 0, 1) for k in MKEYS], 1)

# Farben: linear -> sRGB, Haare dunkler/gleichmäßiger
srgb = np.where(COL <= 0.0031308, COL * 12.92, 1.055 * np.power(np.clip(COL, 0, 1), 1 / 2.4) - 0.055)
srgb[part_v == 3] = HAIR_RGB

# ---------------- Schreiben ----------------
remap = -np.ones(N, dtype=np.int64)
remap[used] = np.arange(len(used))
Pu = P[used]
idx = remap[tris].astype(np.uint16)
blobs = [
    ('pos', np.round(Pu * 1000).astype(np.int16).tobytes(), 'i16', 3),
    ('idx', idx.tobytes(), 'u16', 1),
    ('ji', order[used].astype(np.uint8).tobytes(), 'u8', 4),
    ('jw', q[used].astype(np.uint8).tobytes(), 'u8', 4),
    ('mask', np.round(M[used] * 255).astype(np.uint8).tobytes(), 'u8', len(MKEYS)),
    ('part', part_v[used].astype(np.uint8).tobytes(), 'u8', 1),
    ('col', np.round(np.clip(srgb[used], 0, 1) * 255).astype(np.uint8).tobytes(), 'u8', 3),
]


def J(bone, end='head'):
    return [round(float(x), 4) for x in bpos(C + bone, end)]


off = 0
meta = {'vertices': int(len(used)), 'triangles': int(len(idx)), 'buffers': {}, 'masks': MKEYS,
        'parts': ['skin', 'eyes', 'clothes', 'hair'],
        'joints': [{'name': n, 'parent': p, 'pos': [round(float(x), 4) for x in jpos[jnames.index(n)]]} for n, p, _ in JOINTS],
        'markers': {k: {'joint': j, 'pos': [round(float(x), 4) for x in v]} for k, (j, v) in markers.items()},
        'knuckles': {S: [J(S + '_Index1'), J(S + '_Pinky1')] for S in 'LR'},
        'tips': {S: {'finger': J(S + '_Mid3', 'tail'), 'thumb': J(S + '_Thumb3', 'tail')} for S in 'LR'},
        'source': 'Character Creator base mesh (Realistic Human Basemesh), converted for this app',
        'shape': {'gender': gender}}
with open('%s/%s.bin' % (out_dir, out_name), 'wb') as f:
    for name, b, typ, comp in blobs:
        pad = (-off) % 4
        f.write(b'\0' * pad); off += pad
        meta['buffers'][name] = {'offset': off, 'length': len(b), 'type': typ, 'itemSize': comp}
        f.write(b); off += len(b)
json.dump(meta, open('%s/%s.json' % (out_dir, out_name), 'w'), indent=1)
print('vertices', len(used), 'triangles', len(idx), 'bytes', off)
print('height', round(float(Pu[:, 1].max()), 3), 'x range', Pu[:, 0].min().round(3), Pu[:, 0].max().round(3), 'z range', Pu[:, 2].min().round(3), Pu[:, 2].max().round(3))
for n in jnames:
    print(n, jpos[jnames.index(n)].round(3))
for k, (j, v) in markers.items():
    print('marker', k, j, np.round(v, 3))
print('mask coverage', {k: int((M[:, i] > 0.5).sum()) for i, k in enumerate(MKEYS)})
for p in range(4):
    sel = part_v[used] == p
    if sel.any():
        print('part', p, sel.sum(), 'mean color', np.round(srgb[used][sel].mean(0), 2))
