import json
import struct

with open('models/atlas.json', 'r', encoding='utf-8') as f:
    atlas = json.load(f)

part0 = atlas['parts'][0]
print('Part 0:', part0['name'], 'vertexCount:', part0['vertexCount'], 'indexCount:', part0['indexCount'])
print('Chunk:', part0['chunk'], 'positions offset:', part0['positions'])

with open('models/body-0.bin', 'rb') as f:
    buf = f.read()

count = part0['vertexCount'] * 3
fmt = f'{count}f'
pos_floats = struct.unpack_from(fmt, buf, part0['positions'])
print('First vertex (x,y,z):', pos_floats[0], pos_floats[1], pos_floats[2])
print('Min vertex:', min(pos_floats[0::3]), min(pos_floats[1::3]), min(pos_floats[2::3]))
print('Max vertex:', max(pos_floats[0::3]), max(pos_floats[1::3]), max(pos_floats[2::3]))
print('Declared bounds:', part0['bounds'])
