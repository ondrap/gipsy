#ifndef _FOREIGNIGC_H_
#define _FOREIGNIGC_H_

#include "igc.h"

class ForeignIgc : public Igc
{
    public:
        ForeignIgc(const std::string &content);
        virtual bool gen_g_record();
        virtual bool validate();
        virtual std::string as_str();
        virtual bool can_modify() { return false; };
    private:
        // And save everthing signable before B and starting with B in order to
        // be able to change some data in IGC tracklogs downloaded directly from GPS
        std::stringstream s_prefix;
        std::stringstream s_postfix;
        std::stringstream s_grecord;
};

#endif
