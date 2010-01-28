#!/usr/bin/python
"""
Change libxpcom.so.0d to libxpcom.so in binary file by replacing
the '.' character with 0
"""

import sys

def main():
    if len(sys.argv) != 2:
        print "Usage: %s [gipsy.so]" % sys.argv[0]
        sys.exit(1)

    sstrings = ('libxpcom.so', 'libxpcomglue.so', 'libnspr4.so', 'libplds4.so', 'libplc4.so')

    f = file(sys.argv[1], 'r+')
    data = f.read()
    for sstring in sstrings:
        try:
            apos = data.index(sstring)
            f.seek(apos + len(sstring))
            f.write('\0')
        except ValueError:
            pass
        
    f.close()

if __name__ == '__main__':
    main()
