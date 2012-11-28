/*
 * $Id: gipsy.h 338 2007-05-21 09:07:42Z ondra $
 */

#ifndef _CGIPSY_H_
#define _CGIPSY_H_

#include "IGPSScanner.h"
#include "prlock.h"
#include "prthread.h"

#include <vector>
#include <map>
#include <string>

#include "nsCOMPtr.h"

#include "gpslib/gps.h"
#include "tracklog.h"

#define NS_GIPSY_CID { 0x0d9a0cf4, 0x42d4, 0x4bef, { 0xa1, 0xef, 0x9c, 0x8a, 0x66, 0x29, 0x5f, 0x2d}}
#define NS_GIPSY_CONTRACTID "@pgweb.cz/Gipsy/GPSsight;1"

#define NS_TRACKLOG_CID { 0x45b35860, 0x648b, 0x4b7f, { 0x91, 0xfb, 0x86, 0x84, 0x63, 0x66, 0xfa, 0x50}}
#define NS_TRACKLOG_CONTRACTID "@pgweb.cz/Gipsy/GPSIGC;1"

#define NS_IGCPOINT_CID { 0x1b0548e3, 0xae3a, 0x456a, { 0xb5, 0x74, 0x33, 0x8c, 0xd0, 0x8b, 0xf0, 0x2f}}
#define NS_IGCPOINT_CONTRACTID "@pgweb.cz/Gipsy/GPSPoint;1"

class GpsItem : public IGPSDevInfo {
public: 
    NS_DECL_ISUPPORTS
    NS_DECL_IGPSDEVINFO

    GpsItem();
    virtual ~GpsItem();
    
    PortInfo portinfo;
    std::string gpsname;
    std::string last_error;

    volatile bool scan_enabled;
    short wstatus;          // Watcher status
    int32_t gpstype;
    bool auto_download; // Start download automatically
    volatile bool download_now;  // Request to start download
    volatile bool exit_thread;   // If true, exit this thread

    volatile int32_t progress;  // Download progress

    uint32_t pos;      // Position in gpslist
    
    nsCOMPtr<IGPSIGC> saved_tlog; // Tracklog downloaded from GPS

    void reset();

    volatile bool watcher_running; // True if the watcher is running
    void start_watcher();

    void lock() {PR_Lock(_lock);};
    void unlock() {PR_Unlock(_lock);};

  private:    
    Gps *gps;
    std::vector<int> selected_tracks;  /* Selected track for GPSes that support track selection */
    std::vector< std::pair<time_t,time_t> >saved_tracks;

    // Progress updater
    static bool _progress_updater(void *arg, int cnt, int tot);
    bool progress_updater(int cnt, int tot);
    // Watch thread
    PR_STATIC_CALLBACK(void) _watcher_thread(void *arg);
    void watcher_thread();

    void download_tracklog();
    void obtained_tracklog(Igc *igc, bool generated);
    PRLock *_lock;
};

typedef std::vector<GpsItem *> GpsList;

class Gipsy : public IGPSScanner
{
public:
    NS_DECL_ISUPPORTS
    NS_DECL_IGPSSCANNER

    Gipsy();
    virtual ~Gipsy();

    // Send notification to observers  that the download is complete
    static void notify(nsISupports *subject, const char *topic);
    static void notify(nsISupports *subject, const char *topic, bool remref);

private:
    PR_STATIC_CALLBACK(void) _scanner_thread(void *arg);
    void scanner_thread();

    bool prefs_scan_enabled(const GpsItem &item);
    int prefs_gpstype(const GpsItem &item);

    void prefs_load(void);
    void prefs_save(void);
    void prefs_parse_enausb(char *p);
    void prefs_parse_enaport(char *p);
    void prefs_parse_usbgpstype(char *p);
    void prefs_parse_portgpstype(char *p);

    bool find_gps(const std::string &gpsdev, int32_t &pos);

    PRThread *scanner_tid;
    bool exit_thread;
    bool auto_download;

    PRLock *lock;
    GpsList gpslist;

    std::vector<unsigned int> EnabledUSB;
    std::vector<std::string> EnabledPort;
    std::map< unsigned int, int > GpsTypesUSB;
    std::map< std::string, int > GpsTypesPort;
    
    unsigned int observer_count;
  protected:
  /* additional members */
};


#endif
