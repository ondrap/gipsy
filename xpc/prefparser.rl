#include <string>

#include "gipsy.h"

using namespace std;

%%{
    machine prefdisusb;
    include common "prefcommon.rl";
    
    action addport { DisabledUSB.push_back(i); }
    
    port = int " " @addport;

    main := port*
	0 @{fbreak;};
}%%

void Gipsy::prefs_parse_disusb(char *p)
{
    int cs;
    int i = 0;
    %%write data noerror nofinal;

    %%write init;
    %%write exec noend;
}

%%{
    machine usbprefport;
    include common "prefcommon.rl";

    action addport { DisabledPort.push_back(s); }

    port = string "|" @addport;

    main := port*
	0 @{fbreak;};
}%%

void Gipsy::prefs_parse_disport(char *p)
{
    string s;
    char *begin = NULL;
    int cs;
    %%write data noerror nofinal;

    %%write init;
    %%write exec noend;
}

%%{
    machine usbgpstype;
    include common "prefcommon.rl";
    
    action savegps { usbvendor = i; }
    action addport { GpsTypesUSB[usbvendor] = i; }

    port = int %savegps "|" int ";" @addport;

    main := port* 
	0 @{fbreak;};
}%%

void Gipsy::prefs_parse_usbgpstype(char *p)
{
    int usbvendor = 0;
    int i = 0;
    int cs;
    %%write data noerror nofinal;

    %%write init;
    %%write exec noend;
}

%%{
    machine portgpstype;
    include common "prefcommon.rl";

    action saveport { GpsTypesPort[s] = i; }

    port = string "|" int ";" @saveport;
    main := port*
	0 @{fbreak;};
}%%

void Gipsy::prefs_parse_portgpstype(char *p)
{
    int i = 0;
    char *begin = NULL;
    string s;
    int cs;

    %%write data noerror nofinal;

    %%write init;
    %%write exec noend;
    
}
