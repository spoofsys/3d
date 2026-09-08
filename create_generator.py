import sys

def build():
    with open('./js/anatomy-generator.js', 'w', encoding='utf-8') as out:
        out.write('// Generator\n')
    print('Initialized')

if __name__ == '__main__':
    build()
