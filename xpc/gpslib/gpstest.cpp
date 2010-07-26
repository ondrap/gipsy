#include <iostream>

#include "gps.h"
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
    cout << "Getting ports" << endl;
    PortList ports = get_ports(true);

    for (unsigned int i=0; i < ports.size(); i++) {
	cout << "Device: " << ports[i].device << ", devname: " << ports[i].devname << endl;
	if (ports[i].device == "/dev/cu.usbserial") {
            try {
                Gps *gps = make_gps(ports[i].device, GPS_MLR);
                if (gps) {
                    cout << "GPS type: " << gps->gpsname << ", unitid: " << gps->gpsunitid << endl;
                    PointArr result;
                    gps->download_tracklog(NULL, NULL);
                } else {
                    cout << "GPS open failed" << endl;
                }
            } catch (Exception e) {
                cout << "Got exception, GPS open failed: " << e.error << endl;
            }
        }
    }
}
