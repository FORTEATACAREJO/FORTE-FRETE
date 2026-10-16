"""Select a compatible, available iPhone; prefer stable iOS 18.5 for CI."""
import json, sys

def choose(data):
    choices=[]
    for runtime,devices in data['devices'].items():
        if 'iOS-' not in runtime: continue
        for device in devices:
            if device.get('isAvailable',True) and device['name'].startswith('iPhone'):
                choices.append((0 if runtime.endswith('iOS-18-5') else 1, runtime,device['name'],device['udid']))
    if not choices: raise ValueError('Nenhum iPhone disponível para o teste; confira os runtimes instalados.')
    return sorted(choices)[0][3]

if __name__=='__main__':
    with open(sys.argv[1]) as file: print(choose(json.load(file)))
