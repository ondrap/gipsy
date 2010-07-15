#ifndef _COMPEO_H_
#define _COMPEO_H_

#include "gps.h"
#include "phys.h"
#include "flymaster.h"

class CompeoGps : public NMEAGps {
    public:
        CompeoGps(SerialDev *pdev) : NMEAGps(pdev) {
            try {
                init_gps();
            } catch (Exception e) {
                delete pdev;
                throw e;
            }
        };
        virtual ~CompeoGps() {};
        /* Download tracklog from GPS */
        virtual PointArr download_tracklog(dt_callback cb, void *arg);
    private:
        void init_gps();
};

#endif
