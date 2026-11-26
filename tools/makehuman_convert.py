"""
Wandelt das MakeHuman-Basismodell (CC0-Assets) in ein kompaktes Format für die Fitness-App um.

- wendet MakeHuman-Formvorlagen an (männlich, jung, athletisch)
- behält nur den Körper (und die Augen), entfernt Hilfsgeometrie
- fasst das MakeHuman-Skelett auf die Gelenke der App zusammen (4 Einflüsse je Vertex)
- berechnet Muskelmasken je Vertex (für das Einfärben der trainierten Muskeln)

Aufruf: python3 -I convert.py <human_full_size.json> <targets.npz> <out_dir>
"""
import json
import sys
import numpy as np

src, npz_path, out_dir = sys.argv[1:4]
d = json.load(open(src))
V = np.array(d['vertices'], dtype=np.float64).reshape(-1, 3)
N = len(V)

# ---------------- Formvorlagen ----------------
Z = np.load(npz_path)


def target(name, w):
    idx = Z['targets/macrodetails/%s.index' % name]
    vec = Z['targets/macrodetails/%s.vector' % name].astype(np.float64) * 1e-3
    if len(idx):
        V[idx] += vec * w


MUSCLE, WEIGHT = 1.0, 0.5  # 0..1 wie in MakeHuman (0.5 = Durchschnitt)
mw = {'averagemuscle': 1 - (MUSCLE - 0.5) / 0.5, 'maxmuscle': (MUSCLE - 0.5) / 0.5}
ww = {'averageweight': 1 - (0.5 - WEIGHT) / 0.5, 'minweight': (0.5 - WEIGHT) / 0.5}
for m, a in mw.items():
    for w, b in ww.items():
        target('universal-male-young-%s-%s' % (m, w), a * b)
for race in ['african', 'asian', 'caucasian']:
    target('%s-male-young' % race, 1 / 3)
# etwas größer als der Durchschnitt
# Größe: Durchschnitt
# Idealproportionen (breitere Schultern, schmalere Hüfte)
target('proportions/male-young-maxmuscle-averageweight-idealproportions', 0.7)

# ---------------- Flächen lesen (three.js JSON 3.1) ----------------
faces = d['faces']
mats = [m['DbgName'] for m in d['materials']]
nuv = len(d['uvs'][0]) // 2 if d['uvs'] and d['uvs'][0] else 0
tris_by_mat = {}
i = 0
while i < len(faces):
    t = faces[i]; i += 1
    quad = t & 1
    nv = 4 if quad else 3
    vs = faces[i:i + nv]; i += nv
    mat = 0
    if t & 2:
        mat = faces[i]; i += 1
    if t & 4:
        i += 1
    if t & 8:
        i += nv
    if t & 16:
        i += 1
    if t & 32:
        i += nv
    if t & 64:
        i += 1
    if t & 128:
        i += nv
    tl = tris_by_mat.setdefault(mats[mat], [])
    tl.append((vs[0], vs[1], vs[2]))
    if quad:
        tl.append((vs[0], vs[2], vs[3]))

keep = {'body': 0, 'helper-l-eye': 1, 'helper-r-eye': 1}
tris, tri_part = [], []
for name, part in keep.items():
    for tr in tris_by_mat.get(name, []):
        tris.append(tr); tri_part.append(part)
tris = np.array(tris)
used = np.unique(tris)
remap = -np.ones(N, dtype=np.int64)
remap[used] = np.arange(len(used))

# ---------------- Einheiten: dm -> m, Füße auf y = 0 ----------------
P = V * 0.1
P[:, 1] -= P[used, 1].min()

# ---------------- Gelenke ----------------
jp = d['metadata']['joint_pos_idxs']


def J(name):
    return P[jp[name]].mean(0)


# App-Gelenke: name, Eltern, Position (MakeHuman-Knochenkopf)
JOINTS = [
    ('root', None, 'spine05____head'),
    ('spine', 'root', 'spine04____head'),
    ('chest', 'spine', 'spine02____head'),
    ('neck', 'chest', 'neck01____head'),
    ('head', 'neck', 'head____head'),
]
for s in 'LR':
    JOINTS += [
        ('scap.' + s, 'chest', 'clavicle.%s____tail' % s),
        ('sh.' + s, 'scap.' + s, 'upperarm01.%s____head' % s),
        ('el.' + s, 'sh.' + s, 'lowerarm01.%s____head' % s),
        ('fa.' + s, 'el.' + s, 'lowerarm02.%s____head' % s),
        ('wr.' + s, 'fa.' + s, 'wrist.%s____head' % s),
        ('f1.' + s, 'wr.' + s, 'finger3-1.%s____head' % s),
        ('f2.' + s, 'f1.' + s, 'finger3-2.%s____head' % s),
        ('hp.' + s, 'root', 'upperleg01.%s____head' % s),
        ('kn.' + s, 'hp.' + s, 'lowerleg01.%s____head' % s),
        ('an.' + s, 'kn.' + s, 'foot.%s____head' % s),
        ('toe.' + s, 'an.' + s, 'toe3-1.%s____head' % s),
    ]
jnames = [j[0] for j in JOINTS]
jpos = np.array([J(j[2]) for j in JOINTS])


def group(bone):
    """MakeHuman-Knochen -> App-Gelenk"""
    b = bone.replace('____head', '').replace('____tail', '')
    s = b[-1] if b.endswith(('.L', '.R')) else None
    base = b[:-2] if s else b
    if base in ('root', 'spine05') or base == 'pelvis':
        return 'root'
    if base in ('spine04', 'spine03'):
        return 'spine'
    if base in ('spine02', 'spine01', 'breast', 'clavicle'):
        return 'chest'
    if base.startswith('neck'):
        return 'neck'
    if base == 'shoulder01':
        return 'scap.' + s
    if base.startswith('upperarm'):
        return 'sh.' + s
    if base == 'lowerarm01':
        return 'el.' + s
    if base == 'lowerarm02':
        return 'fa.' + s
    if base in ('wrist',) or base.startswith('metacarpal') or base.startswith('finger1-'):
        return 'wr.' + s
    if base.startswith('finger') and base.endswith('-1'):
        return 'f1.' + s
    if base.startswith('finger'):
        return 'f2.' + s
    if base.startswith('upperleg'):
        return 'hp.' + s
    if base.startswith('lowerleg'):
        return 'kn.' + s
    if base == 'foot':
        return 'an.' + s
    if base.startswith('toe'):
        return 'toe.' + s
    return 'head'  # Gesicht, Kiefer, Augen, Zunge …


bones = [b['name'] for b in d['bones']]
bmap = np.array([jnames.index(group(b)) for b in bones])
si = np.array(d['skinIndices']).reshape(-1, 4)
sw = np.array(d['skinWeights'], dtype=np.float64).reshape(-1, 4)
W = np.zeros((N, len(jnames)))
for k in range(4):
    np.add.at(W, (np.arange(N), bmap[si[:, k]]), sw[:, k])
# Augen fest am Kopf
eye_v = np.unique(np.array([tr for tr, p in zip(tris, tri_part) if p == 1]).ravel())
W[eye_v] = 0
W[eye_v, jnames.index('head')] = 1
order = np.argsort(-W, axis=1)[:, :4]
top = np.take_along_axis(W, order, axis=1)
top /= np.maximum(top.sum(1, keepdims=True), 1e-9)
q = np.round(top * 255).astype(np.int64)
q[:, 0] += 255 - q.sum(1)  # Summe exakt 255

# ---------------- Marker (Griff, Ferse, Zehen, Nacken) ----------------
def jpo(n):
    return jpos[jnames.index(n)]


markers = {}
for s in 'LR':
    hand = np.where(W[:, jnames.index('wr.' + s)] + W[:, jnames.index('f1.' + s)] > 0.5)[0]
    c = P[hand].mean(0)
    markers['grip.' + s] = ('wr.' + s, (jpo('wr.' + s) * 0.35 + jpo('f1.' + s) * 0.65 + c) / 2)
    foot = np.where(W[:, jnames.index('an.' + s)] + W[:, jnames.index('toe.' + s)] > 0.5)[0]
    fp = P[foot]
    heel = fp[np.argmin(fp[:, 2])].copy(); heel[1] = fp[:, 1].min()
    toe = fp[np.argmax(fp[:, 2])].copy(); toe[1] = fp[:, 1].min()
    markers['heel.' + s] = ('an.' + s, heel)
    markers['toe.' + s] = ('toe.' + s, toe)
nk = jpo('neck')
back = P[(np.abs(P[:, 0]) < 0.04) & (np.abs(P[:, 1] - (nk[1] - 0.04)) < 0.02)]
markers['traps'] = ('chest', np.array([0, nk[1] - 0.03, back[:, 2].min() - 0.03]))

# ---------------- Muskelmasken ----------------
# Jeder Muskel ist ein weiches Ellipsoid (Muskelbauch) im Koordinatensystem
# des Körpersegments; so entstehen runde, anatomisch wirkende Flächen.
def ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def band(x, a, b, f):
    return ss(a - f, a + f, x) * (1 - ss(b - f, b + f, x))


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
    q = sum(((d @ ax) / r) ** 2 for ax, r in zip(axes, radii))
    return 1 - ss(0.55, 1.0, q)


def limb_blob(j0, j1, t, front, side, ru, rf, rs, sgn=1):
    a, b, u, f, s = frame(j0, j1)
    c = a + (b - a) * t + f * front + s * side * sgn
    return ell(c, [u, f, s], [ru, rf, rs])


X, Y, Zc = P[:, 0], P[:, 1], P[:, 2]
hip_y = (jpo('hp.L')[1] + jpo('hp.R')[1]) / 2
sh_y = jpo('sh.L')[1]
ch_y = jpo('chest')[1]
torso = w('root', 'spine', 'chest', 'scap.L', 'scap.R', 'neck')
tv = P[torso > 0.6]
EX_, EY, EZ = np.eye(3)
masks = {k: np.zeros(N) for k in ['chest', 'abs', 'lats', 'lowerBack', 'glutes', 'delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'calves']}


def front_z(y, x=0.0, dx=0.03):
    sel = tv[(np.abs(tv[:, 1] - y) < 0.02) & (np.abs(tv[:, 0] - x) < dx)]
    return sel[:, 2].max(), sel[:, 2].min()


abs_y = (hip_y + 0.08 + sh_y - 0.24) / 2
fz, _ = front_z(abs_y)
masks['abs'] = torso * ell(np.array([0, abs_y, fz - 0.03]), [EX_, EY, EZ], [0.075, (sh_y - 0.24 - hip_y - 0.08) / 2 + 0.03, 0.06])
lb_y = hip_y + 0.13
_, bz = front_z(lb_y, 0.04)
for sgn in (1, -1):
    py = sh_y - 0.1
    fz, _ = front_z(py, 0.09 * sgn)
    masks['chest'] += torso * ell(np.array([0.085 * sgn, py, fz - 0.035]), [EX_, EY, EZ], [0.095, 0.075, 0.06])
    _, bz2 = front_z(ch_y + 0.1, 0.11 * sgn)
    masks['lats'] += torso * ell(np.array([0.115 * sgn, ch_y + 0.08, bz2 + 0.035]), [EX_, EY, EZ], [0.075, 0.15, 0.07])
    masks['lowerBack'] += torso * ell(np.array([0.035 * sgn, lb_y, bz + 0.025]), [EX_, EY, EZ], [0.04, 0.1, 0.045])
    hy = hip_y - 0.07
    sel = P[(np.abs(P[:, 1] - hy) < 0.02) & (np.abs(P[:, 0] - 0.085 * sgn) < 0.03)]
    masks['glutes'] += w('root', 'hp.L', 'hp.R', 'spine') * ell(np.array([0.085 * sgn, hy, sel[:, 2].min() + 0.04]), [EX_, EY, EZ], [0.085, 0.095, 0.075])
for S, sgn in (('L', 1), ('R', -1)):
    arm = w('sh.' + S, 'scap.' + S)
    sh = jpo('sh.' + S)
    masks['delts'] += w('sh.' + S, 'scap.' + S, 'chest') * ell(sh + np.array([0.025 * sgn, -0.015, 0]), [EX_, EY, EZ], [0.07, 0.09, 0.075])
    masks['biceps'] += arm * limb_blob('sh.' + S, 'el.' + S, 0.58, 0.032, 0, 0.12, 0.045, 0.04)
    masks['triceps'] += arm * limb_blob('sh.' + S, 'el.' + S, 0.45, -0.035, 0, 0.15, 0.045, 0.045)
    leg = w('hp.' + S)
    masks['quads'] += leg * limb_blob('hp.' + S, 'kn.' + S, 0.52, 0.045, 0, 0.25, 0.06, 0.07)
    masks['hamstrings'] += leg * limb_blob('hp.' + S, 'kn.' + S, 0.55, -0.045, 0, 0.22, 0.05, 0.06)
    masks['calves'] += w('kn.' + S) * limb_blob('kn.' + S, 'an.' + S, 0.3, -0.03, 0, 0.15, 0.065, 0.06)

# Shorts: Hüfte bis Mitte Oberschenkel
masks['shorts'] = band(Y, hip_y - 0.17, hip_y + 0.1, 0.008) * (w('root', 'hp.L', 'hp.R', 'spine') > 0.3)
MKEYS = ['chest', 'abs', 'lats', 'lowerBack', 'glutes', 'delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'calves', 'shorts']
M = np.stack([np.clip(masks[k], 0, 1) for k in MKEYS], 1)

# ---------------- Schreiben ----------------
Pu = P[used]
idx = remap[tris].astype(np.uint16)
pos_mm = np.round(Pu * 1000).astype(np.int16)
part = np.zeros(len(used), dtype=np.uint8)
part[remap[eye_v]] = 1
blobs = [
    ('pos', pos_mm.tobytes(), 'i16', 3),
    ('idx', idx.tobytes(), 'u16', 1),
    ('ji', order[used].astype(np.uint8).tobytes(), 'u8', 4),
    ('jw', q[used].astype(np.uint8).tobytes(), 'u8', 4),
    ('mask', np.round(M[used] * 255).astype(np.uint8).tobytes(), 'u8', len(MKEYS)),
    ('part', part.tobytes(), 'u8', 1),
]
off = 0
meta = {'vertices': int(len(used)), 'triangles': int(len(idx)), 'buffers': {}, 'masks': MKEYS,
        'joints': [{'name': n, 'parent': p, 'pos': [round(float(x), 4) for x in jpos[jnames.index(n)]]} for n, p, _ in JOINTS],
        'markers': {k: {'joint': j, 'pos': [round(float(x), 4) for x in v]} for k, (j, v) in markers.items()},
        'knuckles': {S: [[round(float(x), 4) for x in J('finger2-1.%s____head' % S)], [round(float(x), 4) for x in J('finger5-1.%s____head' % S)]] for S in 'LR'},
        'source': 'MakeHuman base mesh and targets (CC0), converted for this app',
        'shape': {'gender': 'male', 'age': 'young', 'muscle': MUSCLE, 'weight': WEIGHT}}
with open(out_dir + '/human.bin', 'wb') as f:
    for name, b, typ, comp in blobs:
        pad = (-off) % 4
        f.write(b'\0' * pad); off += pad
        meta['buffers'][name] = {'offset': off, 'length': len(b), 'type': typ, 'itemSize': comp}
        f.write(b); off += len(b)
json.dump(meta, open(out_dir + '/human.json', 'w'), indent=1)
print('vertices', len(used), 'triangles', len(idx), 'bytes', off)
print('height', round(float(Pu[:, 1].max()), 3), 'z range', Pu[:, 2].min().round(3), Pu[:, 2].max().round(3))
for n in jnames:
    print(n, jpos[jnames.index(n)].round(3))
for k, (j, v) in markers.items():
    print('marker', k, j, np.round(v, 3))
print('mask coverage', {k: int((M[:, i] > 0.5).sum()) for i, k in enumerate(MKEYS)})
