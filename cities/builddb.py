#!/usr/bin/python

from pysqlite2 import dbapi2 as sqlite
import sys

def test(lat,lon):
    lat = round((lat+0.25) * 2) / 2.0 - 0.25
    lon = round((lon+0.25) * 2) / 2.0 - 0.25
    sec1 = int((lat-0.25) * 2 * 1000 + 2 * (lon - 0.25))
    sec2 = int((lat-0.25) * 2 * 1000 + 2 * (lon + 0.25))
    sec3 = int((lat+0.25) * 2 * 1000 + 2 * (lon - 0.25))
    sec4 = int((lat+0.25) * 2 * 1000 + 2 * (lon + 0.25))
    print sec1, sec2, sec3, sec4

def main():
    db = sqlite.connect('cities.db')
    c = db.cursor()
    c.execute('create table cities (country text, city text, lat real, lon real, sector integer)')
    c.execute('create index sec_idx on cities (sector)');

    seen = set()
    
    for line in sys.stdin:
        country,t,city,t,lat,lon = line.split(',')
        country = country.upper()
        city = unicode(city, 'latin1').encode('utf8')
        city = city.decode('utf8')
        lat = float(lat)
        lon = float(lon)

        sector = int(round(lat * 2)*1000 + round(lon * 2))
        
        if (lat,lon) not in seen:
            seen.add((lat,lon))
            c.execute('insert into cities (country,city,lat,lon,sector) values (?,?,?,?,?)',
                      (country, city, lat, lon, sector))
    db.commit()

        

if __name__ == '__main__':
    main()
