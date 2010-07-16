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

class GpsItem : public IGPSDevInfo {
public: 
    NS_DECL_ISUPPORTS;
    NS_DECL_IGPSDEVINFO;

    GpsItem();
    virtual ~GpsItem();
    
    PortInfo portinfo;
    std::string gpsname;
    std::string last_error;

    volatile bool scan_enabled;
    short wstatus;          // Watcher status
    PRInt32 gpstype;
    PRBool auto_download; // Start download automatically
    volatile PRBool download_now;  // Request to start download
    volatile PRBool exit_thread;   // If true, exit this thread

    volatile PRInt32 progress;  // Download progress

    uint32_t pos;      // Position in gpslist
    
    nsCOMPtr<IGPSIGC> saved_tlog; // Tracklog downloaded from GPS

    void reset();

    volatile PRBool watcher_running; // True if the watcher is running
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
    NS_DECL_IGPSSCANNER;

    Gipsy();
    virtual ~Gipsy();

    // Send notification to observers  that the download is complete
    static void notify(nsISupports *subject, const char *topic);

private:
    PR_STATIC_CALLBACK(void) _scanner_thread(void *arg);
    void scanner_thread(IGPSScanner *main);

    bool prefs_scan_enabled(const GpsItem &item);
    int prefs_gpstype(const GpsItem &item);

    void prefs_load(void);
    void prefs_save(void);
    void prefs_parse_disusb(char *p);
    void prefs_parse_disport(char *p);
    void prefs_parse_usbgpstype(char *p);
    void prefs_parse_portgpstype(char *p);

    bool find_gps(const std::string &gpsdev, PRInt32 &pos);

    PRThread *scanner_tid;
    bool exit_thread;
    PRBool auto_download;

    PRLock *lock;
    GpsList gpslist;

    std::vector<unsigned int> DisabledUSB;
    std::vector<std::string> DisabledPort;
    std::map< unsigned int, int > GpsTypesUSB;
    std::map< std::string, int > GpsTypesPort;
    
    unsigned int observer_count;
  protected:
  /* additional members */
};


#endif
