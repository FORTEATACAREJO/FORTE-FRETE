"""Generate the existing Forte F mark without third-party packages."""
from pathlib import Path
import struct, zlib, json
root = Path(__file__).resolve().parents[1]
def icon(size, path):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            a,b=x*64/size,y*64/size
            white = (16 <= a < 28 and 12 <= b < 56) or (16 <= a < 51 and 12 <= b < 22) or (16 <= a < 47 and 30 <= b < 40)
            row.extend((255,255,255) if white else (215,25,32))
        rows.append(b'\x00'+row)
    def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
    data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
for size in [192,512]: icon(size,root/f'icon-{size}.png')
icon(1024,root/'ios/ForteFrete/Assets.xcassets/AppIcon.appiconset/AppIcon.png')
(root/'ios/ForteFrete/Assets.xcassets/AppIcon.appiconset/Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2)+'\n')
(root/'ios/ForteFrete/Assets.xcassets/Contents.json').write_text('{"info":{"author":"xcode","version":1}}\n')
color=root/'ios/ForteFrete/Assets.xcassets/LaunchBackground.colorset';color.mkdir(exist_ok=True)
(color/'Contents.json').write_text(json.dumps({'colors':[{'idiom':'universal','color':{'color-space':'srgb','components':{'red':'0.843','green':'0.098','blue':'0.125','alpha':'1.000'}}}],'info':{'author':'xcode','version':1}},indent=2)+'\n')
print('Ícones Android/web e iOS gerados a partir da marca existente.')
