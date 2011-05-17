#ifndef _GPS_H_
#define _GPS_H_

#include <string>
#include <vector>
#include <math.h>

#ifdef WIN32
# include <win_stdint.h>
#else
# include <stdint.h>
#endif

#include "point.h"

#define GARMIN_VENDOR 0x091e

#define GPS_GARMIN    0
#define GPS_AIRCOTEC  1
#define GPS_COMPEO    2
#define GPS_MLR       3
#define GPS_FLYMASTER 4
#define GPS_IQ        5

/* General exception thrown on communication errors, etc. */
class Exception {
public:
    std::string error;

    Exception() {};
	Exception(const std::string &str) { error = str; };
};

/* Exception thrown when no data is received (for Aircotec to distinguish between bad data received)*/
class NoData : public Exception {
  public:
    NoData(const std::string &str) : Exception(str) {};
};

/* Exception thrown when the device does not exist anymore */
class OpenException : public Exception {
  public:
    OpenException(const std::string &str) : Exception(str) {};
};

/* Exception thrown on timeout */
class TimeoutException : public Exception {
  public:
    TimeoutException() : Exception("timeout") {};
};

/* Exception on protol error */
class ProtoException : public Exception {
  public:
    ProtoException(const std::string &str) : Exception(str) {};
};

typedef bool (*dt_callback)(void *, int, int);

/* Generic class representing a GPS */
class Gps {
  public:
    Gps() { };
    virtual ~Gps() {};

    virtual PointArr download_tracklog(dt_callback cb, void *);
    virtual std::string download_igc(int track, dt_callback cb, void *);
    
    std::string gpsname;   /* Name of the GPS */
    uint32_t gpsunitid;   /* Ideally UnitID of the GPS, otherwise
			   * control sum of the control packets */
    
    virtual bool has_track_selection();
    
    std::vector<int> selected_tracks;  /* Selected track for GPSes that support track selection */
    std::vector< std::pair<time_t,time_t> >saved_tracks;
};

class PortInfo {
  public:
    PortInfo() : usb_vendor(0) {} ;
    PortInfo(std::string pdev, std::string pdevname) : device(pdev), devname(pdevname), usb_vendor(0) {};

    std::string device;
    std::string devname;

    std::string last_error;

    uint32_t usb_vendor;
};

typedef std::vector <PortInfo> PortList;

/* List ports available for GPS connection */
PortList get_ports(bool check);

/* Return instance of gps connected to device */
Gps * make_gps(const std::string &device, int gpstype);


#endif
