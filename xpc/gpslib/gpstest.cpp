#include <iostream>

#include "gps.h"
#include "aircotec.h"
#include "garmin.h"
#include "igc.h"

using namespace std;

bool cb(void *arg, int c1, int c2)
{
    cerr << c1 << " " << c2 << endl;
    return false;
}

int main(int argc, char **argv)
{
    //cout << "Getting ports" << endl;
    //PortList ports = get_ports(true);

    Gps *gps = make_gps("/dev/ttyUSB0", GPS_IQ);
    cout << "GPS type: " << gps->gpsname << ", unitid: " << gps->gpsunitid << endl;
    cerr << "Downloading" << endl;
    string igc = gps->download_igc(0, NULL, NULL);
    cerr << igc;
    
/*
    for (unsigned int i=0; i < ports.size(); i++) {
	cout << "Device: " << ports[i].device << ", devname: " << ports[i].devname << endl;
        try {
            Gps *gps = make_gps(ports[i].device, GPS_GARMIN);
            if (gps) {
                cout << "GPS type: " << gps->gpsname << ", unitid: " << gps->gpsunitid << endl;
                PointArr result;
                result = gps->download_tracklog(NULL, NULL);
                for (int i=0; i < result.size(); i++) {
                    Trackpoint *point = &result[i];
                    cout << point->lat << " " << point->lon << " " << point->new_trk << " " << point->time << endl;
                }
                cout << "done" << endl;
            } else {
                cout << "GPS open failed" << endl;
            }
        } catch (Exception e) {
            cout << "Got exception, GPS open failed: " << e.error << endl;
        }
    }
*/
}
