/*
 * Trackload downloader library 
 *
 * Spec:
 * -- USB autodetekce GPSek
 * -- kontrola, jestli je GPS pripojena
 * -- download tracklogu z GPS s moznostu preruseni a rozumnym resenim timeoutu
 * *
 * Pouziti:
 *  #include "gps.h"
 *  pointarr tracklog;
 * 
 *  UnixSerialLink phys("/dev/ttyUSB0");
 *  try {
 *     GarminGps gps(&phys);
 *  } catch (Exception e) {
 *     cerr << "GPS neni pripojena:" << e.error << endl;
 *  } 
 *  try {
 *     tracklog = gps.download_tracklog(callback, arg);
 *  } catch { 
 *     cerr << "Chyba pri downloadu tracklogu: " << e.error << endl;
 *  }
 * 
 */

#ifdef DEBUG
# include <iostream>
#endif

#ifndef WIN32
#include <fcntl.h>
#include <errno.h>
#include <unistd.h>
#endif

#include <vector>
#include <string>
#include <string.h>
#include <stdio.h>
#include "gps.h"

#include "garmin.h"
#include "aircotec.h"
#include "mlr.h"
#include "flymaster.h"
#include "compeo.h"

using namespace std;

#ifdef GPS_DEBUG
#  include <stdio.h>
#  define DPRINT(fmt,...) printf(fmt, ##__VA_ARGS__)
#else
#  define DPRINT(fmt,...)
#endif

string Gps::download_igc(int track, dt_callback cb, void *)
{
    throw Exception("Not implemented.");
}

PointArr Gps::download_tracklog(dt_callback cb, void *)
{
    throw Exception("Not implemented.");
}

#ifdef WIN32
#include <Windows.h>
#include <initguid.h>
#include <setupapi.h> // You may need to explicitly link with setupapi.lib
#include <tchar.h>
#include <atlbase.h>
#include <atlconv.h>

static BOOL IsNumeric(LPCTSTR pszString, BOOL bIgnoreColon)
{
    size_t nLen = _tcslen(pszString);
    if (nLen == 0)
	return FALSE;
    
    //Assume the best
    BOOL bNumeric = TRUE;

    for (size_t i=0; i<nLen && bNumeric; i++) {
	bNumeric = (_istdigit(pszString[i]) != 0);
	if (bIgnoreColon && (pszString[i] == _T(':')))
	    bNumeric = TRUE;
    }
    
    return bNumeric;
}


// Code taken from http://www.naughter.com/enumser.html
static void add_com_ports(PortList &result)
{
    USES_CONVERSION;

  //First need to convert the name "Ports" to a GUID using SetupDiClassGuidsFromName
    DWORD dwGuids = 0;
    SetupDiClassGuidsFromName(_T("Ports"), NULL, 0, &dwGuids);
    if (dwGuids == 0)
	return;
    
    //Allocate the needed memory
    GUID* pGuids = new GUID[dwGuids];
    
    //Call the function again
    if (!SetupDiClassGuidsFromName(_T("Ports"), pGuids, dwGuids, &dwGuids)) {
	//Free up the memory before we return
	delete [] pGuids;
	return;
    }

    //Now create a "device information set" which is required to enumerate all the ports
    HDEVINFO hDevInfoSet = SetupDiGetClassDevs(pGuids, NULL, NULL, DIGCF_PRESENT);
    delete [] pGuids;pGuids = NULL;
    if (hDevInfoSet == INVALID_HANDLE_VALUE)
	return;
    
    //Finally do the enumeration
    BOOL bMoreItems = TRUE;
    SP_DEVINFO_DATA devInfo;
    for (int nIndex=0; ; nIndex++)  {
	//Enumerate the current device
	devInfo.cbSize = sizeof(SP_DEVINFO_DATA);
	bMoreItems = SetupDiEnumDeviceInfo(hDevInfoSet, nIndex, &devInfo);
	if (!bMoreItems)
	    break;
    	
	//Get the registry key which stores the ports settings
	HKEY hDeviceKey = SetupDiOpenDevRegKey(hDevInfoSet, &devInfo, DICS_FLAG_GLOBAL, 0, DIREG_DEV, KEY_QUERY_VALUE);
	if (hDeviceKey) {
	    //Read in the name of the port
	    TCHAR pszPortName[256];
	    DWORD dwSize = sizeof(pszPortName);
	    DWORD dwType = 0;
	    if ((RegQueryValueEx(hDeviceKey, _T("PortName"), NULL, &dwType, reinterpret_cast<LPBYTE>(pszPortName), &dwSize) == ERROR_SUCCESS) && (dwType == REG_SZ)) {
		//If it looks like "COMX" then
		//add it to the array which will be returned
		size_t nLen = _tcslen(pszPortName);
		if (nLen <= 3 || !(_tcsnicmp(pszPortName, _T("COM"), 3) == 0) && IsNumeric(&pszPortName[3], FALSE))
		    continue;
		
		TCHAR pszFriendlyName[256];
		DWORD dwSize = sizeof(pszFriendlyName);
		DWORD dwType = 0;
		
		// Comdev, aby otevřel COM větší než 9
		string comdev(string("\\\\.\\") + W2CA(pszPortName));
		
		if (SetupDiGetDeviceRegistryProperty(hDevInfoSet, &devInfo, SPDRP_DEVICEDESC, &dwType, reinterpret_cast<PBYTE>(pszFriendlyName), dwSize, &dwSize) && (dwType == REG_SZ)) {
		    string name(W2CA(pszFriendlyName));
		    name += string("(") + W2CA(pszPortName) + ")";
		    PortInfo gps(comdev, name);
    		    result.push_back(gps);
		} else {
		    PortInfo gps(comdev, W2CA(pszPortName));
		    result.push_back(gps);
		}
	    }
	    //Close the key now that we are finished with it
	    RegCloseKey(hDeviceKey);
	}
    }  
    
    //Free up the "device information set" now that we are finished with it
    SetupDiDestroyDeviceInfoList(hDevInfoSet);
}

DEFINE_GUID(GUID_GRMN, 0x2c9c45c2L, 0x8e7d, 0x4c08, 0xa1, 0x2d, 0x81, 0x6b, 0xba, 0xe7, 0x22, 0xc0);
static void add_usb_ports(PortList &result)
{
    USES_CONVERSION;
    DWORD nret;
    // USB detection
    
    HDEVINFO dinfo = SetupDiGetClassDevs((GUID*) &GUID_GRMN, NULL, NULL, 
					 DIGCF_PRESENT | DIGCF_INTERFACEDEVICE);
    PSP_INTERFACE_DEVICE_DETAIL_DATA ddetail = 0;
    SP_DEVINFO_DATA dinfodata = { sizeof( SP_DEVINFO_DATA ) };
    
    SP_DEVICE_INTERFACE_DATA ifacedata;
    ifacedata.cbSize = sizeof(ifacedata);
    
    for (int i=0; SetupDiEnumDeviceInterfaces(dinfo, NULL, (GUID*) &GUID_GRMN, i, &ifacedata ); i++) {
	SetupDiGetDeviceInterfaceDetail(dinfo, &ifacedata, NULL, 0, &nret, NULL);
	ddetail = (PSP_INTERFACE_DEVICE_DETAIL_DATA) malloc(nret);
    	ddetail->cbSize = sizeof(SP_INTERFACE_DEVICE_DETAIL_DATA);
	
	SetupDiGetDeviceInterfaceDetail(dinfo, &ifacedata, ddetail, nret, NULL, &dinfodata );
	string dpath(W2CA(ddetail->DevicePath));

        result.push_back(PortInfo(dpath, "Garmin USB GPS"));
    	free( ddetail );
    }
}

PortList get_ports(bool check)
{
    PortList result;

    add_com_ports(result);
    add_usb_ports(result);

    return result;
}

#else // non-win32

#include <glob.h>

/* Return vendor of the /dev/ttyUSB? type device */
static int get_vendor(string dev)
{
    const string USBROOT("/sys/bus/usb-serial/devices/");
    /* Usekni /dev/ z cesty */
    string ndev = dev.substr(5);

    string sysdev = USBROOT + ndev;
    char buf[256];
    int ret = readlink(sysdev.c_str(), buf, 255);
    if (ret == -1)
	return 0;
    buf[ret] = '\0';
    
    string productf = USBROOT + string(buf) + "/../../idVendor";

    FILE *f = fopen(productf.c_str(), "r");
    if (!f)
	return 0;

    int result;

    ret = fscanf(f, "%X", &result);
    fclose(f);

    if (ret == -1)
	return 0;

    return result;
}

/* Return true if the device represents a USB device */
bool is_usb_dev(const char *dev)
{
    return !strncmp(dev, "/dev/ttyUSB", strlen("/dev/ttyUSB"));
}

/* Return true if unix lockfile exists (..not exactly correct,
 * but hopefully sufficient)
 */
bool unix_is_locked(const char *dev)
{
    const char *bname = strrchr(dev, '/');
    if (!bname) // ???
	return false;
    bname++; // Bname contains the device name

    if (! access((string("/var/lock/LCK..") + bname).c_str(), F_OK))
	return true;
    return false;
}

/* Add accessible devices from pglob to result vector */
void update_from_globs(glob_t &pglob, PortList &result, bool check)
{
    for (unsigned int i=0; i < pglob.gl_pathc; i++) {
	char *dev = pglob.gl_pathv[i];
	DPRINT("Found %s\n", dev);
	// If the device is locked, skip it
	// TODO: really skip? you might add it as disabled into the list
	if (unix_is_locked(dev))
	    continue;
	
	PortInfo gps(dev, dev);
	    
	if (is_usb_dev(dev)) {
           gps.usb_vendor = get_vendor(dev);
	   // TODO - read USB device database
	   if (gps.usb_vendor == GARMIN_VENDOR)
	       gps.devname = string("Garmin USB ") + dev;
	}
	result.push_back(gps);
    }
}

#ifdef USE_LIBUSB
/* Scan libusb interfaces and add non-claimed garmin gps */
static void add_libusb_garmin(PortList &result)
{
    struct usb_bus *busses;
    static int libusb_initialized = 0;
    struct usb_bus *bus;

    if (!libusb_initialized) {
	usb_init();
	libusb_initialized = 1;
    }
    usb_find_busses();
    usb_find_devices();

    busses = usb_get_busses();
    
    for (bus = busses; bus; bus = bus->next) {
	struct usb_device *dev;
	
	for (dev = bus->devices; dev; dev = dev->next) {
	    if (dev->descriptor.idVendor == GARMIN_VENDOR) {
		string file = string(bus->dirname) + '/' + dev->filename;
		PortInfo gps(file, string("Garmin USB ") + file);
		gps.usb_vendor = GARMIN_VENDOR;
		result.push_back(gps);
	    }
	}	
    }
}

static struct usb_device *find_usb_dev(const string &device)
{
    int slashpos = device.find_last_of('/');
    string busdir = device.substr(0, slashpos);
    string devname = device.substr(slashpos + 1); 

    struct usb_bus *busses = usb_get_busses();    
    struct usb_bus *bus;    
    
    for (bus = busses; bus; bus = bus->next) {
	struct usb_device *dev;

	if (busdir != bus->dirname)
	    continue;
	
	for (dev = bus->devices; dev; dev = dev->next) {
	    if (dev->descriptor.idVendor == GARMIN_VENDOR && \
		devname == dev->filename) {
		return dev;
	    }
	}	
    }

    return NULL;
}
#endif

/* Return list of available ports of devices 
 *
 * Scans all serial and usb-serial devices and tries to open
 * them 
 *
 * @check - if true, check for rights, if permission denied,
 *          do not show the GPS at all
 */
PortList get_ports(bool check)
{
    PortList result;
    int res;
    glob_t pglob;

#ifdef XP_MACOSX
    res = glob("/dev/cu.*",0,NULL, &pglob);
    if (!res) {
	update_from_globs(pglob, result, check);
	globfree(&pglob);
    }
#elif defined (__SVR4) && defined (__sun)
    /* Solaris */
    res = glob("/dev/term/*",0,NULL, &pglob);
    if (!res) {
	update_from_globs(pglob, result, check);
	globfree(&pglob);
    }
#else
    DPRINT("Listing /dev/ttyS*\n");
    res = glob("/dev/ttyS*",0,NULL, &pglob);
    if (!res) {
	update_from_globs(pglob, result, check);
	globfree(&pglob);
    }
    DPRINT("Listing /dev/ttyUSB*\n");
    res = glob("/dev/ttyUSB*", 0, NULL, &pglob);
    if (!res) {
	update_from_globs(pglob, result, check);
	globfree(&pglob);
    }
#endif

#ifdef USE_LIBUSB
    add_libusb_garmin(result);
#endif    
    
    return result;
}

#endif // WIN32

#ifdef WIN32

Gps * make_gps(const string &device, int gpstype)
{
    Gps *gps;
    if (gpstype == GPS_GARMIN) {
        PhysInterface *phys;
	if (device.substr(0, 7) == string("\\\\.\\COM"))
	    phys = new SerialInterface(new WinSerialDev(device));
	else
	    phys = new WinUSBLink(device);
	gps = new GarminGps(phys);
    } else if (gpstype == GPS_AIRCOTEC) {
	gps = new AircotecGps(new WinSerialDev(device));
    } else if (gpstype == GPS_MLR) {
	gps = new MLRGps(new WinSerialDev(device));
    } else if (gpstype == GPS_FLYMASTER) {
        gps = new FlymasterGps(new WinSerialDev(device));
    } else if (gpstype == GPS_COMPEO) {
        gps = new CompeoGps(new WinSerialDev(device));
    } else
	return NULL;
    
    return gps;
}

#else

Gps * make_gps(const string &device, int gpstype)
{
    Gps *gps;

    if (gpstype == GPS_GARMIN) {
        PhysInterface *phys;
#ifdef USE_LIBUSB
	if (device[0] != '/') {
	    struct usb_device *usbdev = find_usb_dev(device);
	    if (!usbdev)
		return NULL;
	    phys = new UnixUSBLink(usbdev);
	} else
#endif	
	    phys = new SerialInterface(new UnixSerialDev(device));
	gps = new GarminGps(phys);
    } else if (gpstype == GPS_AIRCOTEC) {
	gps = new AircotecGps(new UnixSerialDev(device));
    } else if (gpstype == GPS_MLR) {
	gps = new MLRGps(new UnixSerialDev(device));
    } else if (gpstype == GPS_FLYMASTER) {
        gps = new FlymasterGps(new UnixSerialDev(device));
    } else if (gpstype == GPS_COMPEO) {
        gps = new CompeoGps(new UnixSerialDev(device));
    } else
	return NULL;
    
    return gps;
}

#endif
