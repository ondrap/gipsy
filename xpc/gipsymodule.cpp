#include "xpcom-config.h"
#include "nsIGenericFactory.h"
#include "gipsy.h"
#include "tracklog.h"

NS_GENERIC_FACTORY_CONSTRUCTOR(Gipsy);
NS_GENERIC_FACTORY_CONSTRUCTOR(Tracklog);
NS_GENERIC_FACTORY_CONSTRUCTOR(GpsPoint);

static nsModuleComponentInfo components[] = {
    {
	"Gipsy GPS component",
	{ 0x0d9a0cf4, 0x42d4, 0x4bef, { 0xa1, 0xef, 0x9c, 0x8a, 
					0x66, 0x29, 0x5f, 0x2d}},
	"@pgweb.cz/Gipsy/GPSsight;1",
	GipsyConstructor
    } ,
    {
	"IGC tracklog representation",
	{ 0x45b35860, 0x648b, 0x4b7f, { 0x91, 0xfb, 0x86, 0x84,
					0x63, 0x66, 0xfa, 0x50}},
	"@pgweb.cz/Gipsy/GPSIGC;1",
	TracklogConstructor
    } ,
    {
	"IGC point representation",
	{ 0x1b0548e3, 0xae3a, 0x456a, { 0xb5, 0x74, 0x33, 0x8c,
					0xd0, 0x8b, 0xf0, 0x2f}},
	"@pgweb.cz/Gipsy/GPSPoint;1",
	GpsPointConstructor
    }
};

NS_IMPL_NSGETMODULE("GipsyModule", components);
