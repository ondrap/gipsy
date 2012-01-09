#ifndef _POINT_H_
#define _POINT_H_

#include <math.h>
#include <vector>

using namespace std;

#ifdef WIN32
#include <float.h>
# define isfinite(x) _finite(x)
#endif

#define RADIUS 6372795.477598

#ifndef M_PI
// Win32 lacks M_PI
# define M_PI 3.14159265358979323846
#endif

/* Type for point in tracklog */
struct Trackpoint {
    double lat;
    double lon;
    double gpsalt;
    double baroalt;
    bool fix3d;

    time_t time;

    bool new_trk;

    Trackpoint() : gpsalt(0), baroalt(0), fix3d(true), new_trk(false) {};

    double distance(const Trackpoint &other) const {
	double olon, olat;
	
	double mlon = lon*2*M_PI/360.0;
	double mlat = lat*2*M_PI/360.0;
	
	olon = other.lon * 2*M_PI/360.0;
	olat = other.lat * 2*M_PI/360.0;
	
	double angle = acos(sin(mlat)*sin(olat) + cos(mlat)*cos(olat)*cos(mlon-olon));
	if (!isfinite(angle))
	    angle = 0;
	
	return angle * RADIUS;
    }
    
    double speed(const Trackpoint &other) const {
	time_t otime = other.time;
	
	time_t diff = time - otime;
	if (diff < 0)
	    diff = -diff;
	
	if (!diff)
	    return 0;
	
	return distance(other) / diff;
    }
    
    // Return GPS altitude, if 0 then Baro altitude
    double alt() const {
	if (gpsalt != 0.0)
	    return gpsalt;
	return baroalt;
    }
    // Return altitude, prefere baro altitude
    double altPbaro() const {
        if (baroalt != 0.0)
            return baroalt;
        return gpsalt;
    }

    double vario(const Trackpoint &other) const {
	if (other.time == time)
	    return 0;
	return (altPbaro() - other.altPbaro()) / (time - other.time);
    }
};

/* Type for tracklog */
typedef std::vector<Trackpoint> PointArr;

#endif
