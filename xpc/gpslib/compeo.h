#ifndef _COMPEO_H_
#define _COMPEO_H_

#include "gps.h"
#include "phys.h"
#include "flymaster.h"

class CompeoGps : public NMEAGps {
    public:
        CompeoGps(SerialDev *pdev) : NMEAGps(pdev) {
            init_gps();
        };
        virtual ~CompeoGps() {};
        
        /* Download tracklog from GPS */
        virtual std::string download_igc(int track, dt_callback cb, void *);

        /* Redefine - we have one */
        virtual bool has_track_selection();

    private:
        void init_gps();
};

#endif
