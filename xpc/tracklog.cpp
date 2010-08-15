#include <string>
#include <sstream>
#include <iomanip>
#include <math.h>
#include <float.h>

using namespace std;

#include "prio.h"
#include "prmem.h"
#include "nsStringAPI.h"
#include "nsEmbedString.h"
#include "plstr.h"
#include "nscore.h"
#include "nsXPCOM.h"
#include "nsISupports.h"
#include "nsCRT.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsIDOMCanvasRenderingContext2D.h"
#include "nsIDOMParser.h"
#include "nsIFileStreams.h"
#include "nsNetCID.h"
#include "nsIDOMNodeList.h"
#include "nsIDOMDocument.h"
#include "nsIDOMElement.h"
#include "nsIDOMText.h"

#include "tracklog.h"
#include "gpslib/igc.h"
#include "cp1250.h"

#ifdef WIN32
#   include "win_strptime.h"
static double round(double x)
{
	return floor(x+0.5);
}
#endif

NS_IMPL_ISUPPORTS1(Tracklog, IGPSIGC)

/* Maximalni povolena mezera v tracklogu */
#define MAX_ALLOWED_BREAK (15*60)
/* Velikost mezery */
#define MIN_BREAK 60
/* Max. pocet MIN_BREAK mezer */
#define MAX_BREAK_COUNT 2

/* Minimal vario to be considered flight */
#define MIN_FLIGHT_VARIO 1.0
/* Minimal speed to be considered flight */
#define MIN_FLIGHT_SPEED (10.0/3.6)
/* Number of seconds to add to the beginning of flight to catch 
 * the whole takeoff */
#define LAUNCH_DELAY 15

/* Percentage of tracklog to fit to a start/end of flight */
/* Percentag = 1/PERCENTAGE_ADJUST */
/* This means that the automatic adjustment takes place only if
 * there are many more points than can fit into the window */
#define PERCENTAGE_ADJUST 400
/* Forward points to check for speed characteristics */
#define FORWARD_POINTS 4

#define WAIT_TIME 90

static PRUnichar * wstrdup(const PRUnichar *input)
{
    PRUnichar *result;

    /* Compute the length */
    int size;
    for (size=0; input[size]; size++)
	;
    size++;
    
    result = (PRUnichar *)NS_Alloc(size * sizeof(*result));
    if (!result)
	return result;
    for (int i=0; i < size; i++)
	result[i] = input[i];
    return result;
}


/* Filter values */
/* Minimal time for an interval to be considered flight */
#define FILTER_MIN_TIME    (2*60)

/* Maximum number of points in flight file to be drawn */
#define MAX_DRAW_POINTS    1600


Tracklog::Tracklog()
{
    // Leave everything uninitialized, it gets initialized by
    // igcLoad, and even then we need not initialize the breaklens,
    // as nobody will use them
    igc = new Igc();
}

Tracklog::Tracklog(Igc *tigc) : igc(tigc)
{
    if (igc->can_modify())
	make_break_points();
    else {
	breakpoints.push_back(0);
	breaklens.push_back(igc->tracklog.size());
    }
}

Tracklog::~Tracklog()
{
    delete igc;
    /* destructor code */
}

/* Generate breakpoints by inspecting the tracklog */
void Tracklog::make_break_points()
{
    unsigned int i;

    if (!igc->tracklog.size())
	return;
    /* Update breakpoints - find intervals bigger then 1 minute */
    igc->tracklog[0].new_trk = true;
    for (i=1; i < igc->tracklog.size(); i++) {
	if (igc->tracklog[i].time - igc->tracklog[i-1].time > MIN_BREAK)
	    igc->tracklog[i].new_trk = true;
    }
    
    /* Create list of breakpoints & sectorlengths */
    for (i=0; i < igc->tracklog.size(); i++) {
	if (!igc->tracklog[i].new_trk)
	    continue;
	if (!allow_section(i))
	    continue;

	breakpoints.push_back(i);
	int len;
	for (len=1; i+len < igc->tracklog.size() && !igc->tracklog[i+len].new_trk; len++)
	    ;
	breaklens.push_back(len);
    }
}

/* Find start of interval (max 2 breaks > 1min, 0 break > 15 min */
int Tracklog::interval_start(int idx)
{
    int i;
    int breaks = 0;

    for (i=idx; i > 0; --i) {
	if (igc->tracklog[i].time - igc->tracklog[i-1].time > MAX_ALLOWED_BREAK)
	    break;
	if (igc->tracklog[i].time - igc->tracklog[i-1].time > MIN_BREAK) {
	    breaks++;
	    if (breaks > MAX_BREAK_COUNT)
		break;
	}
    }
    return i;
}

int Tracklog::interval_end(int idx)
{
    int i;
    int breaks = 0;

    for (i=idx; i < (int)igc->tracklog.size()-2; i++) {
	if (igc->tracklog[i+1].time - igc->tracklog[i].time > MAX_ALLOWED_BREAK)
	    break;
	if (igc->tracklog[i+1].time - igc->tracklog[i].time > MIN_BREAK) {
	    breaks++;
	    if (breaks > MAX_BREAK_COUNT)
		break;
	}
    }
    return i;
}

/* Remove break-sections that do not look like flight
 * Time is at least 2 minutes 
 *
 * @idx index of first point in this section
 */
bool Tracklog::allow_section(int idx)
{
    int startpoint = interval_start(idx);
    int endpoint = interval_end(idx);

    if (igc->tracklog[endpoint].time - igc->tracklog[startpoint].time > FILTER_MIN_TIME)
	return true;
    
    return false;
}

NS_IMETHODIMP Tracklog::IgcSave(nsILocalFile *file)
{
    nsresult rv;
    int bytes;

    /* Open the file */
    PRFileDesc *f; 
    rv = file->OpenNSPRFileDesc(PR_WRONLY | PR_TRUNCATE | PR_CREATE_FILE, 0644, &f); 
    if (NS_FAILED(rv)) 
	return NS_ERROR_UNEXPECTED;

    string output = igc->as_str();
    bytes = PR_Write(f, output.c_str(), output.length());

    PR_Close(f);
    
    return (bytes == (int) output.length()) ? NS_OK : NS_ERROR_UNEXPECTED;
}

// atof in C locale
static double my_atof(const char *s)
{
    double result;
    
    stringstream in(s);
    in.imbue(std::locale("C"));
    in >> result;
    return result;
}

// Return text of subelement of trackpoint
static string get_subelement(const nsAString &elem, nsIDOMElement *trkpt)
{
    nsresult rv;
    nsAutoString lstr;
    
    nsCOMPtr<nsIDOMNodeList> ele_list;
    trkpt->GetElementsByTagName(elem, getter_AddRefs(ele_list));
    PRUint32 elelen;
    ele_list->GetLength(&elelen);
    if (elelen) {
	nsCOMPtr<nsIDOMNode> ele_n;
	ele_list->Item(0, getter_AddRefs(ele_n));
	nsCOMPtr<nsIDOMNode> ele_text_n;
	ele_n->GetFirstChild(getter_AddRefs(ele_text_n));
	if (ele_n) {
	    nsCOMPtr<nsIDOMText> ele_text(do_QueryInterface(ele_text_n, &rv));
	    if (!NS_FAILED(rv)) {
		ele_text->GetData(lstr);
		return string(NS_ConvertUTF16toUTF8(lstr).get());
	    }
	}
    }
    return string();
}

#include <iostream>
/* Decode time from xsd:datetime into time_t */
static time_t decode_time(string input)
{
    struct tm gtime;
    int pos=0;
    time_t result;
    
    memset(&gtime, 0, sizeof(gtime));
    
    if (!input.length())
	return -1;
    
    if (input[0] == '-')
	pos++;
    
    string subtime(input.substr(pos, pos+19));
    subtime += " UTC";
    char *next_c = strptime(subtime.c_str(), "%Y-%m-%dT%H:%M:%S %Z", &gtime);
    if (!next_c)
	return -1;
    
    string next(next_c);
    gtime.tm_isdst = 0;
    result = make_gmtime(&gtime);
    
    if (next[0] == '+' || next[0] == '-') {
	char type = next[0];
	strptime(next.c_str() + 1, "%H:%M", &gtime);
	int move = gtime.tm_hour * 3600 + gtime.tm_min * 60;
	if (type == '+')
	    move = -move;
	result += move;
    }
    
    return result;
}

NS_IMETHODIMP Tracklog::IgcLoadGPX(nsILocalFile *file)
{
    nsresult rv;
    PRInt64 fsize;
    
    nsCOMPtr<nsIDOMParser> domparser = do_CreateInstance("@mozilla.org/xmlextras/domparser;1", &rv);
    if (NS_FAILED(rv)) 
	return rv;
    
    file->GetFileSize(&fsize);

    nsCOMPtr<nsIFileInputStream> instream=
	    do_CreateInstance(NS_LOCALFILEINPUTSTREAM_CONTRACTID, &rv);
    if (NS_FAILED(rv))
	return rv;
    
    rv = instream->Init(file, PR_RDONLY, 0, nsIFileInputStream::CLOSE_ON_EOF);
    if (NS_FAILED(rv))
	return rv;

    nsCOMPtr<nsIDOMDocument> document;
    
    rv = domparser->ParseFromStream(instream, "UTF-8", fsize, "text/xml", getter_AddRefs(document));
    if (NS_FAILED(rv))
	return rv;

    nsCOMPtr<nsIDOMNodeList> seglist;
    rv = document->GetElementsByTagName(NS_LITERAL_STRING("trkseg"), getter_AddRefs(seglist));
    if (NS_FAILED(rv))
	return rv;
    PRUint32 listlength;
    seglist->GetLength(&listlength);
    
    PointArr parr;
    for (PRUint32 i=0; i < listlength; i++) {
	nsCOMPtr<nsIDOMNodeList> pointlist;
	nsCOMPtr<nsIDOMNode> trkseg;
	seglist->Item(i, getter_AddRefs(trkseg));

	rv = document->GetElementsByTagName(NS_LITERAL_STRING("trkpt"), getter_AddRefs(pointlist));
	if (NS_FAILED(rv))
	    return rv;
	
	PRUint32 pointnum;
	pointlist->GetLength(&pointnum);
	for (PRUint32 j=0; j < pointnum; j++) {
	    nsCOMPtr<nsIDOMNode> trkpt_n;
	    pointlist->Item(j, getter_AddRefs(trkpt_n));
	    nsCOMPtr<nsIDOMElement> trkpt(do_QueryInterface(trkpt_n));
	    
	    Trackpoint point;
	    point.new_trk = (j == 0);

	    /* Lat & Lon */
	    nsAutoString lstr;
	    trkpt->GetAttribute(NS_LITERAL_STRING("lat"), lstr);
	    point.lat = my_atof(NS_ConvertUTF16toUTF8(lstr).get());
	    trkpt->GetAttribute(NS_LITERAL_STRING("lon"), lstr);
	    point.lon = my_atof(NS_ConvertUTF16toUTF8(lstr).get());

	    string alt = get_subelement(NS_LITERAL_STRING("ele"), trkpt);
	    point.gpsalt = my_atof(alt.c_str());
	    
	    string time = get_subelement(NS_LITERAL_STRING("time"), trkpt);
	    point.time = decode_time(time);
	    parr.push_back(point);
	}
    }
    igc = new Igc(parr, "GPX Import", 0);
    make_break_points();

    return NS_OK;
}

/* void igcLoad (in nsILocalFile file); */
// TODO: better error detection
NS_IMETHODIMP Tracklog::IgcLoad(nsILocalFile *file)
{
    nsresult rv;

    /* Open the file */
    PRFileDesc *f; 
    rv = file->OpenNSPRFileDesc(PR_RDONLY, 0, &f); 
    if (NS_FAILED(rv)) 
        return NS_ERROR_UNEXPECTED;
    
    // Read the whole file into a string
    stringstream text;
    const int bufsize = 16384;
    char buffer[bufsize];
    int read;
    do {
        read = PR_Read(f, buffer, bufsize);
        if (read)
            text.write(buffer, read);
        
    } while (read > 0);
    text << '\0';
    PR_Close(f);

    igc = new Igc(text.str());
    // Expect at least 1 trackpoint
    if (! igc->tracklog.size())
        return NS_ERROR_UNEXPECTED;

    return NS_OK;
}


/* Generate IGC file */
NS_IMETHODIMP Tracklog::IgcGet(char **_retval)
{
    if (!_retval)
       return NS_ERROR_NULL_POINTER;
    
    string text = igc->as_str();
    
    *_retval = (char *)PR_Malloc(text.size()+1);
    strcpy(*_retval, text.c_str());

    return NS_OK;
}

/* long igcPointCount (); */
NS_IMETHODIMP Tracklog::IgcPointCount(PRInt32 *_retval)
{
    *_retval = igc->tracklog.size();

    return NS_OK;
}

/* IGPSPoint igcPoint (in long idx); */
NS_IMETHODIMP Tracklog::IgcPoint(PRInt32 idx, IGPSPoint **_retval)
{
    if (idx < 0 || idx >= (int)igc->tracklog.size())
	return NS_ERROR_UNEXPECTED;

    Trackpoint pt = igc->tracklog[idx];

    *_retval = new GpsPoint(pt);
    NS_ADDREF(*_retval);

    return NS_OK;
}

/* long igcBreakCount (); */
/* Return number of distinct sectors */
NS_IMETHODIMP Tracklog::IgcBreakCount(PRInt32 *_retval)
{
    *_retval = breakpoints.size();

    return NS_OK;
}

/* long igcBreak (in long idx); */
/* Return index of first point in sector */
NS_IMETHODIMP Tracklog::IgcBreak(PRInt32 idx, PRInt32 *_retval)
{
    if (idx < 0 || idx >= (int)breakpoints.size())
	return NS_ERROR_UNEXPECTED;

    *_retval = breakpoints[idx];

    return NS_OK;
}

/* long igcBreakLen (in long idx); */
/* Return length (in points) of given sector */
NS_IMETHODIMP Tracklog::IgcBreakLen(PRInt32 idx, PRInt32 *_retval)
{
    if (idx < 0 || idx >= (int)breakpoints.size())
	return NS_ERROR_UNEXPECTED;

    *_retval = breaklens[idx];

    return NS_OK;
}

/* Create new tracklog from select break-sections */
NS_IMETHODIMP Tracklog::IgcBreakSelect(PRUint32 count, PRInt32 *bpoints, 
				       IGPSIGC **_retval)
{
    PointArr selection;
    int lastidx = -1;
    int bpointcount;
    
    if (!count) {
	*_retval = NULL;
	return NS_OK;
    }

    IgcBreakCount(&bpointcount);

    for (unsigned int i=0; i < count; i++) {
	int idx = bpoints[i];
	if (idx < 0 || idx >= bpointcount)
	    return NS_ERROR_UNEXPECTED;

	// Check that the input array is sorted
	if (idx < lastidx)
	    return NS_ERROR_UNEXPECTED;

	lastidx = idx;

	int bstart;
	int len;
	IgcBreak(idx, &bstart);
	IgcBreakLen(idx, &len);

	for (int j=0;j < len; j++)
	    selection.push_back(igc->tracklog[j + bstart]);
    }
    
    Igc *newigc = new Igc(*igc);
    newigc->tracklog = selection;

    if (igc->validate()) {
	if (! newigc->gen_g_record()) // Failed crypto library?
	    return NS_ERROR_UNEXPECTED;
    }

    *_retval = new Tracklog(newigc);
    NS_ADDREF(*_retval);

    return NS_OK;
}


/* IGPSIGC igcSelectPoints (in PRUint32 count, [array, size_is (count)] in PRInt32 valueArray); */
/* Expect that the array is sorted */
NS_IMETHODIMP Tracklog::IgcSelectPoints(PRUint32 count, PRInt32 *points, 
					IGPSIGC **_retval)
{
    PointArr selection;
    int lastidx = -1;

    if (!count) {
	*_retval = NULL;
	return NS_OK;
    }

    for (unsigned int i=0; i < count; i++) {
	int idx = points[i];
	if (idx < 0 || idx >= (int) igc->tracklog.size())
	    return NS_ERROR_UNEXPECTED;

	// Check that the input array is sorted
	if (idx < lastidx)
	    return NS_ERROR_UNEXPECTED;

	lastidx = idx;

	selection.push_back(igc->tracklog[idx]);
    }
    
    Igc *newigc = new Igc(*igc);
    newigc->tracklog = selection;

    if (igc->validate())
	newigc->gen_g_record();

    *_retval = new Tracklog(newigc);
    NS_ADDREF(*_retval);

    return NS_OK;
}

nsresult Tracklog::getparam(const char *param, string &val)
{
    if (!strcmp(param, "pilot"))
	val = igc->pilot;
    else if (!strcmp(param, "glider"))
	val = igc->glider;
    else if (!strcmp(param, "gliderid"))
	val = igc->gliderid;
    else if (!strcmp(param, "site"))
	val = igc->site;
    else if (!strcmp(param, "country"))
	val = igc->country;
    else if (!strcmp(param, "comment"))
	val = igc->l_record;
    else if (!strcmp(param, "a_record"))
	val = igc->a_record;
    else if (!strcmp(param, "gpsname"))
	val = igc->gpsname;
    else if (!strcmp(param, "unique_id"))
	val = igc->make_unique_id();
    else if (!strcmp(param, "faiclass"))
	val = igc->faiclass;
    else if (!strcmp(param, "biplace")) {
	if (!igc->biplace) {
	    // *_retval = NULL;
	    return NS_SUCCESS_FILE_DIRECTORY_EMPTY;
	}
	val = "true";
    } else if (param[0]== 'x') {
	val = "";
	for (unsigned int i=0; i < igc->x_params.size(); i++)
	    if (igc->x_params[i].first == param) {
		val = igc->x_params[i].second;
		break;
	    }
    } else
	return NS_ERROR_UNEXPECTED; 
    
    return NS_OK;
}

NS_IMETHODIMP Tracklog::IgcGetParamUTF8(const char *param, char **_retval)
{
    nsresult rv;
    string val;
    rv = getparam(param, val);
    if (NS_FAILED(rv))
	return rv;
    if (rv == NS_SUCCESS_FILE_DIRECTORY_EMPTY) {
	*_retval = NULL;
	return NS_OK;
    }
	
    
    if (is_ascii(val) || is_correct_utf8(val))
	*_retval = strdup(val.c_str());
    else {
	val = cp1250_to_utf8(val);
	*_retval = strdup(val.c_str());
    }

    return NS_OK;
}

/* wstring igcGetParam (in string param); */
NS_IMETHODIMP Tracklog::IgcGetParam(const char *param, PRUnichar **_retval)
{
    nsresult rv;
    string val;
    rv = getparam(param, val);
    if (NS_FAILED(rv))
	return rv;
    if (rv == NS_SUCCESS_FILE_DIRECTORY_EMPTY) {
	*_retval = NULL;
	return NS_OK;
    }
    
    if (is_ascii(val) || is_correct_utf8(val))
	*_retval = wstrdup(NS_ConvertUTF8toUTF16(val.c_str()).get());
    else {
	val = cp1250_to_utf8(val);
	*_retval = wstrdup(NS_ConvertUTF8toUTF16(val.c_str()).get());
    }

    return NS_OK;
}

/* void igcSetParam (in string param, in wstring value); */
NS_IMETHODIMP Tracklog::IgcSetParam(const char *param, const PRUnichar *value)
{
    if (!param || !value)
	return NS_ERROR_NULL_POINTER;

    nsEmbedCString val = NS_ConvertUTF16toUTF8(value);
    
    if (!strcmp(param, "pilot"))
	igc->pilot = val.get();
    else if (!strcmp(param, "glider"))
	igc->glider = val.get();
    else if (!strcmp(param, "gliderid"))
	igc->gliderid = val.get();
    else if (!strcmp(param, "site"))
	igc->site = val.get();
    else if (!strcmp(param, "comment"))
	igc->l_record = val.get();
    else if (!strcmp(param, "country"))
	igc->country = val.get();
    else if (!strcmp(param, "biplace"))
	igc->biplace = value ? true : false;
    else if (!strcmp(param, "faiclass"))
	igc->faiclass = val.get();
    else if (param[0]== 'x') {
	unsigned int i;
	for (i=0; i < igc->x_params.size(); i++) {
	    if (igc->x_params[i].first == param) {
		igc->x_params[i].second=val.get();
		break;
	    }
	}
	if (i == igc->x_params.size()) {
	    pair<string,string> item(param, val.get());
	    igc->x_params.push_back(item);
	}
    } else
	return NS_ERROR_UNEXPECTED;

    return NS_OK;
}

/* readonly attribute long gpsid; */
NS_IMETHODIMP Tracklog::GetGpsunitid(PRInt32 *aGpsid)
{
    *aGpsid = igc->gpsunitid;

    return NS_OK;
}


/* Return true if given idx can be considered active flight 
 * @idx - if the 'idx' is part of active flight
 */
bool Tracklog::is_active_flight(int idx)
{
    if (idx + FORWARD_POINTS >= (int) igc->tracklog.size())
	return false;
    
    Trackpoint last(igc->tracklog[idx]);
    for (unsigned int i=1; i < FORWARD_POINTS; i++) {
	if (igc->tracklog[idx + i].speed(last) < MIN_FLIGHT_SPEED)
	    return false;

	last = igc->tracklog[idx + i];
    }
    return true;
}

/* Return true if given idx can be considered not a flight 
 * @idx - if the 'idx' is part of active flight
 */
bool Tracklog::is_not_flight(int idx)
{
    if (idx + FORWARD_POINTS >= (int) igc->tracklog.size())
	return false;
    
    Trackpoint last(igc->tracklog[idx]);
    for (unsigned int i=1; i < FORWARD_POINTS; i++) {
	if (igc->tracklog[idx + i].speed(last) > MIN_FLIGHT_SPEED)
	    return false;

	last = igc->tracklog[idx + i];
    }
    return true;
}

bool Tracklog::is_flight_begin(int idx)
{
    time_t start = igc->tracklog[idx].time;

    for (int i=idx; i > 0 && start - igc->tracklog[i].time < WAIT_TIME; i--) {
	if (igc->tracklog[i].speed(igc->tracklog[i-1]) > MIN_FLIGHT_SPEED)
	    return false;
	if (fabs(igc->tracklog[i].vario(igc->tracklog[i-1])) > MIN_FLIGHT_VARIO)
	    return false;
    }
    
    return true;
}

/* long igcStripBegin (); */
/* The criteria for a beginning of the tracklog is
 * - speed > 10km/h or vario > 2m/s for at least 3 points
 * - first few points of tracklog are skipped if there is speed > 100km/h
 */
NS_IMETHODIMP Tracklog::IgcStripBegin(PRInt32 *_retval)
{
    PRInt32 end;
    IgcStripEnd(&end);
    if (!end) {
	*_retval = 0;
	return NS_OK;
    }

    for (unsigned int i=end-1; i >= 0; i--) {
	if (is_flight_begin(i)) {
	    if (i) {
		// Move 15 seconds backward to catch some small movement
		int delay = LAUNCH_DELAY;
		for (i--;i > 0 && delay > 0;i--) 
		    delay -= (int)(igc->tracklog[i+1].time - igc->tracklog[i].time);
	    }
	    *_retval = i;
	    return NS_OK;
	}
    }
    *_retval = 0;

    return NS_OK;
}

/* long igcStripEnd (); */
/* Strip everything, until speed < 5km/h && |vario| < 0.4 */
NS_IMETHODIMP Tracklog::IgcStripEnd(PRInt32 *_retval)
{
    unsigned int i;
    
    if (!igc->tracklog.size()) {
	*_retval = 0;
	return NS_OK;
    }
    
    for (i = igc->tracklog.size() - FORWARD_POINTS; i > 0; i--) {
	if (is_active_flight(i))
	    break;
    }
    *_retval = i + FORWARD_POINTS;
    
    if (*_retval >= (int)igc->tracklog.size())
	*_retval = igc->tracklog.size() - 1;

    return NS_OK;
}

NS_IMETHODIMP Tracklog::GetCanModify(PRBool *aCanModify)
{
    *aCanModify = igc->can_modify();
    
    return NS_OK;
}

/* Find nearest point of tracklog to the specified time */
NS_IMETHODIMP Tracklog::IgcFindNearest(PRTime time, PRInt32 *_retval)
{
    if (!igc->tracklog.size())
	return NS_ERROR_UNEXPECTED;
    
    time /= 1000; // Convert to seconds

    if (time <= igc->tracklog[0].time) {
	*_retval = 0;
	return NS_OK;
    }
    if (time >= igc->tracklog[igc->tracklog.size()-1].time) {
	*_retval = igc->tracklog.size() - 1;
	return NS_OK;
    }
    // Find nearest smaller or equal, assume even recording intervals
    double scale = (double) igc->tracklog.size() / (igc->tracklog[igc->tracklog.size()-1].time - igc->tracklog[0].time);
    int guess = (int) ((time - igc->tracklog[0].time) * scale);
    
    while (time < igc->tracklog[guess].time)
	guess--;
    while (time >= igc->tracklog[guess+1].time)
	guess++;

    if (time - igc->tracklog[guess].time < igc->tracklog[guess+1].time - time)
	*_retval = guess;
    else
	*_retval = guess+1;

    return NS_OK;
}


/* Find probable start/end of tracklog 
 * Search +/- 1% of trackpoints 
 */
NS_IMETHODIMP Tracklog::IgcAdjustPoint(PRInt32 idx, PRBool start, 
				       PRInt32 *_retval)
{
    if (!igc->tracklog.size())
	return NS_ERROR_UNEXPECTED;
    
    int perc = igc->tracklog.size()/PERCENTAGE_ADJUST;

    int minidx = idx - perc;
    if (minidx < 0)
	minidx = 0;
    int maxidx = idx + perc;
    if (maxidx >= (int) igc->tracklog.size())
	maxidx = igc->tracklog.size() - 1;

    // minidx/maxidx must not go over a pause! 
    for (int i=idx+1; i < maxidx; i++)
	if (igc->tracklog[i].time - igc->tracklog[i-1].time > MIN_BREAK)
	    maxidx = i;
    for (int i=idx-1; i >= minidx; i--)
	if (igc->tracklog[i+1].time - igc->tracklog[i].time > MIN_BREAK)
	    minidx = i + 1;

    *_retval = idx;
    if (start) {
	if (is_active_flight(idx)) {
	    for (int i=idx - 1; i >= minidx; i--)
		if (!is_active_flight(i)) {
		    *_retval = i + 1;
		    return NS_OK;
		}
	} else {
	    for (int i=idx; i < maxidx; i++)
		if (is_active_flight(i)) {
		    *_retval = i;
		    return NS_OK;
		}
	}
    } else {
	if (is_active_flight(idx)) {
	    for (int i=idx; i < maxidx; i++)
		if (is_not_flight(i)) {
		    *_retval = i;
		    return NS_OK;
		}
	} else {
	    for (int i=idx - 1; i >= minidx; i--)
		if (!is_not_flight(i)) {
		    *_retval = i + FORWARD_POINTS;
		    if (*_retval >= (int)igc->tracklog.size())
			*_retval = igc->tracklog.size() - 1;
		    return NS_OK;
		}
	}
    }

    return NS_OK;
}


/* Validate tracklog section marked by interval points */
NS_IMETHODIMP Tracklog::IgcSectionValid(PRUint32 count, PRInt32 *points, 
					PRBool *_retval)
{
    if (count < 2) {
	*_retval = true;
	return NS_OK;
    }

    time_t lasttime = 0;
    int gaps = 0;
    int lastidx = -1;

    for (unsigned int i=0; i < count; i++) {
	int idx = points[i];
	if (idx < 0 || idx >=  (int)igc->tracklog.size() || idx <= lastidx)
	    return NS_ERROR_UNEXPECTED;
	lastidx = idx;
	
	if (lasttime) {
	    time_t time = igc->tracklog[idx].time;
	    if (time - lasttime > MAX_ALLOWED_BREAK) {
		*_retval = false;
		return NS_OK;
	    }
	    if (time - lasttime > MIN_BREAK)
		if (++gaps > 2) {
		    *_retval = false;
		    return NS_OK;
		}
	}
	lasttime = igc->tracklog[idx].time;
    }

    *_retval = true;
    return NS_OK;
}

/* Scan the tracklog and remove points that seem to have been recorded
 * wrongly
 *
 *
 */
NS_IMETHODIMP Tracklog::IgcRemoveBadPoints()
{
    return NS_ERROR_NOT_IMPLEMENTED;
}




/* Compute statistics */
NS_IMETHODIMP Tracklog::IgcGetStat(PRInt16 param, double *_retval)
{
    if (!igc->tracklog.size())
	return NS_ERROR_UNEXPECTED;
    
    switch (param) {
    case STAT_DIST_STARTLAND: /* Distance start->landing */
	*_retval = igc->tracklog[0].distance(igc->tracklog[igc->tracklog.size()-1]);
	break;
    case STAT_DIST_FLOWN:     /* Total distance flown */
	*_retval = 0;
	for (unsigned int i=1; i < igc->tracklog.size(); i++)
	    *_retval += igc->tracklog[i-1].distance(igc->tracklog[i]);
	break;
    case STAT_HEIGHT_MAX:     /* Maximum height */
	*_retval = igc->tracklog[0].alt();
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    if (*_retval < igc->tracklog[i].alt())
		*_retval = igc->tracklog[i].alt();
	}
	break;
    case STAT_HEIGHT_MIN:     /* Minimum height */
	*_retval = igc->tracklog[0].alt();
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    if (*_retval > igc->tracklog[i].alt())
		*_retval = igc->tracklog[i].alt();
	}
	break;
    case STAT_HEIGHT_UPSUM:   /* Thermal height gain */
	*_retval = 0;
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    double diff = igc->tracklog[i].alt() - igc->tracklog[i-1].alt();
	    if (diff > 0)
		*_retval += diff;
	}
	break;
    case STAT_SPEED_MAX: {      /* Maximum speed */
	*_retval = 0;
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    double speed = igc->tracklog[i-1].speed(igc->tracklog[i]);
	    if (speed > *_retval)
		*_retval = speed;
	}
	break;
    }
    case STAT_VARIO_MAX:      /* Maximum value on vario */
	*_retval = -9999;
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    double vario = igc->tracklog[i].vario(igc->tracklog[i-1]);
	    if (vario > *_retval)
		*_retval = vario;
	}
	break;
    case STAT_VARIO_MIN:      /* Minimum value on vario */
	*_retval = 9999;
	for (unsigned int i=1; i < igc->tracklog.size(); i++) {
	    double vario = igc->tracklog[i].vario(igc->tracklog[i-1]);
	    if (vario < *_retval)
		*_retval = vario;
	}
	break;
    case STAT_LON_MIN:
    case STAT_LAT_MIN:
	*_retval = 9999;
	for (unsigned int i=0; i < igc->tracklog.size(); i++) {
	    double val = param == STAT_LON_MIN ? igc->tracklog[i].lon : igc->tracklog[i].lat;
	    if (val < *_retval)
		*_retval = val;
	}
	break;
    case STAT_LON_MAX:
    case STAT_LAT_MAX:
	*_retval = -9999;
	for (unsigned int i=0; i < igc->tracklog.size(); i++) {
	    double val = param == STAT_LON_MAX ? igc->tracklog[i].lon : igc->tracklog[i].lat;
	    if (val > *_retval)
		*_retval = val;
	}
	break;
    default:
	return NS_ERROR_NOT_IMPLEMENTED;
    }
    return NS_OK;
}

/***************************************************/
/* Projection (currently mercator projection)      */
/* Assume the input in degrees, convert to radians */

/* double svgProjectLat (in double lat); */
NS_IMETHODIMP Tracklog::SvgProjectLat(double lat, double *_retval)
{
    lat = lat * 2 * M_PI / 360;

    *_retval = 0.5 * log((1+sin(lat))/(1-sin(lat)));

    return NS_OK;
}

NS_IMETHODIMP Tracklog::SvgProjectLon(double lon, double *_retval)
{
    *_retval = lon * 2 * M_PI / 360;
    return NS_OK;
}

/* Inverse function for projection */
NS_IMETHODIMP Tracklog::SvgProjectX(double x, double *_retval)
{
    *_retval = x * 360 / (2 * M_PI);

    return NS_OK;
}

/* double svgProjectY (in double y); */
NS_IMETHODIMP Tracklog::SvgProjectY(double y, double *_retval)
{
    *_retval = atan(sinh(y)) * 360 / (2 * M_PI);

    return NS_OK;
}


/***************************************************/
/* SVG helper functions for tracklog visualisation */


static double nop(double inp)
{
    return inp;
}

/* string svgPathData (in short property); */
NS_IMETHODIMP Tracklog::SvgPathData(PRInt16 property, PRInt16 objtype,
				    PRInt32 width, PRInt32 height,
				    double maxval, PRBool doint,
				    char **_retval )
{
    stringstream result;
    double (*dr)(double) = doint ? round : nop;
    
    if (igc->tracklog.size() < 2) {
	*_retval = PL_strdup("");
	if (!*_retval)
	    return NS_ERROR_OUT_OF_MEMORY;
	return NS_OK;
    }

    /* Scale it downreasonable number of points, otherwise the system is too slow */
    int step = 1;
    if (doint)
	step = (igc->tracklog.size() / MAX_DRAW_POINTS) + 1;

    time_t btime = igc->tracklog[0].time;
    time_t difftime = igc->tracklog[igc->tracklog.size()-1].time - btime;
    if (difftime == 0)
	return NS_ERROR_UNEXPECTED;
    double tscale = (double)width / difftime;

    double yscale = -height / maxval;

    for (unsigned int i=0; i < igc->tracklog.size(); i+=step) {
	if (i == 0) {
	    result << 'M';
	} else if (igc->tracklog[i].time - igc->tracklog[i-step].time > MIN_BREAK) {
	    // There is a gap, skip it
	    if (objtype == POLYGON) { // Skip polygon, down to 0, then back up
		result << 'L';
		result << dr((igc->tracklog[i-step].time - btime) * tscale);
		result << ' ';
		result << height;
		
		result << 'L';
		result << dr((igc->tracklog[i].time - btime) * tscale);
		result << ' ';
		result << height;
		
		result << 'L';
	    } else {
		result << 'M'; 
		// If this point is followed by gap too, draw a vertical line
		if (i+step < igc->tracklog.size() && \
		    igc->tracklog[i+step].time - igc->tracklog[i].time > MIN_BREAK){
		    result << dr((igc->tracklog[i].time - btime) * tscale);
		    result << ' ';
		    result << height;
		    result << 'L';
		}
	    }
	} else 
	    result << 'L';

	switch (property) {
	case ALTITUDE:
	    result << dr((igc->tracklog[i].time - btime) * tscale);
	    result << ' ';
	    result << dr(igc->tracklog[i].alt() * yscale + height);
	    break;
	case SPEED:
	    if (i == 0)
		result << "0 " << height;
	    else {
		result << dr((igc->tracklog[i].time - btime) * tscale);
		result << ' ';
		double speed = igc->tracklog[i-1].speed(igc->tracklog[i]);
		if (speed > maxval)
		    speed = maxval;
		result << dr(speed * yscale + height);
	    }
	    break;
	}
    }
    
    if (objtype == POLYGON) {
	result << 'L' << width << ' ' << height;
	result << "L 0 " << height;
	result << 'Z';
    }
    result << '\0';

    *_retval = PL_strdup(result.str().c_str());
    if (!*_retval)
	return NS_ERROR_OUT_OF_MEMORY;

    return NS_OK;
}

/* Altitude/speed profile with X-axis = points, 1 point = 2 pixels */
NS_IMETHODIMP Tracklog::SvgPointData(PRInt16 property, PRInt16 objtype, PRInt32 startpoint,
				      PRInt32 width, PRInt32 height, 
				      double maxval, char **_retval)
{
    stringstream result;
    double yscale = -height / maxval;
    
    if (igc->tracklog.size() < 2) {
	*_retval = PL_strdup("");
	return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
    }
    if (startpoint < 0 || startpoint >= (int)igc->tracklog.size())
	return NS_ERROR_UNEXPECTED;
    
    if (startpoint + width/2 > (int)igc->tracklog.size())
	width = (igc->tracklog.size() - startpoint) * 2;


    for (int i=0; i < width/2; i++) {
	if (i == 0) 
	    result << 'M';
	else {
	    result << 'L';
	}

	result << i*2 << ' ';
	
	switch (property) {
	case ALTITUDE:
	    result << (int)(igc->tracklog[startpoint + i].alt() * yscale + height);
	    break;
	case SPEED:
	    if (startpoint+i == 0)
		result << height;
	    else {
		double speed = igc->tracklog[startpoint+i-1].speed(igc->tracklog[startpoint+i]);
		if (speed > maxval)
		    speed = maxval;
		result << (int)(speed * yscale + height);
	    }
	    break;
	}
    }
    if (objtype == POLYGON) {
	result << 'L' << width << ' ' << height;
	result << "L 0 " << height;
	result << 'Z';
    }
    result << '\0';
    
    *_retval = PL_strdup(result.str().c_str());
    return *_retval ? NS_OK : NS_ERROR_OUT_OF_MEMORY;
}


/* Return KML compatibile point export */
NS_IMETHODIMP Tracklog::KmlTrack(char **_retval)
{
    stringstream text;

    if (!_retval)
       return NS_ERROR_NULL_POINTER;

    text << setprecision(8);
    for (unsigned int i=0; i < igc->tracklog.size(); i++) {
	text << igc->tracklog[i].lon << ',' << igc->tracklog[i].lat << ',';
	text << igc->tracklog[i].alt() << '\n';
    }
    text << '\0';

    *_retval = (char *)PR_Malloc(text.str().size()+1);
    strcpy(*_retval, text.str().c_str());

    return NS_OK;
}

/* Draw profile using given canvas context
 * Use callback to return points that were added to the canvas
 */
NS_IMETHODIMP Tracklog::DrawCanvasProfile(nsIDOMCanvasRenderingContext2D *ctx, 
                                           PRInt32 width, PRInt32 height, 
                                           PRInt32 minheight, PRInt32 maxheight, 
                                           PRTime starttime, double timescale, 
                                           IGPSCallback *callback)
{
    double scale = ((double) height) / (maxheight - minheight);
    // Javascript uses time in milliseconds
    starttime /= 1000; 
    timescale *= 1000;
    
    if (!ctx)
        return NS_ERROR_NULL_POINTER;

    ctx->BeginPath();

    PRTime lasttime = 0;
    int startx = 0;
    int lastx = 0;
    for (size_t i=0; i < igc->tracklog.size(); i++) {
        int x = (igc->tracklog[i].time - starttime) * timescale;
        int alt = igc->tracklog[i].alt();
        int y = height - (alt - minheight) * scale;
        
        // Detect hole in tracklog
        if (igc->tracklog[i].time - lasttime > 60) {
            if (lasttime) {
                ctx->Stroke();
                ctx->LineTo(lastx, height);
                ctx->LineTo(startx, height);
                ctx->ClosePath();
                ctx->Fill();
            }
            ctx->BeginPath();
            ctx->MoveTo(x, y);
            startx = x;
        }
        if (lastx != x) {
            ctx->LineTo(x, y);
            if (callback)
                callback->AddPoint(x, i);
        }
        lasttime = igc->tracklog[i].time;
        lastx = x;
    }
    ctx->Stroke();
    ctx->LineTo(width, height);
    ctx->LineTo(startx, height);
    ctx->ClosePath();
    ctx->Fill();
    
    return NS_OK;
}

// Projection functions for working with canvas
// Project longitude directly to X coordinate with 0 on -180
int Tracklog::canvasProjectLon(double lon, int limit)
{
    double scale = ((double) limit) / 360.0;
    return round((lon + 180) * scale);
}

// Project latitude directly to Y coordinate with 0 on north pole
int Tracklog::canvasProjectLat(double lat, int limit)
{
    lat = lat * 2.0 * M_PI / 360.0;
    double merclat = 0.5 * log((1.0 + sin(lat))/ (1.0 - sin(lat)));
    // We are rectangular, therefore the linear scale is:
    double scale = limit / (2.0 * M_PI);
    double centercoord = merclat * scale;
    return round(((double) limit) / 2.0 - centercoord);
}


/* Draw track on canvas */
/* void drawCanvasTrack (in nsIDOMCanvasRenderingContext2D ctx, in long limit, in long startx, in long starty); */
NS_IMETHODIMP Tracklog::DrawCanvasTrack(nsIDOMCanvasRenderingContext2D *ctx, 
                                        PRInt32 limit, PRInt32 startx, PRInt32 starty)
{
    if (!ctx)
        return NS_ERROR_NULL_POINTER;

    ctx->BeginPath();
    Trackpoint *point = &igc->tracklog[0];
    ctx->MoveTo(canvasProjectLon(point->lon, limit) - startx, 
                canvasProjectLat(point->lat, limit) - starty);
    
    PRTime lasttime = 0;
    for (size_t i = 1; i < igc->tracklog.size(); i++) {
        point = &igc->tracklog[i];
        // Make it slightly faster
        if (limit <= 1048576 && point->time - lasttime < 5)
            continue;

        lasttime = point->time;
        ctx->LineTo(canvasProjectLon(point->lon, limit) - startx, 
                    canvasProjectLat(point->lat, limit) - starty);
    }
    ctx->Stroke();

    return NS_OK;
}


NS_IMPL_ISUPPORTS1(GpsPoint, IGPSPoint)

GpsPoint::GpsPoint() : lon(0), lat(0), alt(0), time(0)
{
    // Empty point
}

GpsPoint::GpsPoint(const Trackpoint &pt)
{
    /* member initializers and constructor code */
    lat = pt.lat;
    lon = pt.lon;
    alt = pt.alt();
    time = ((PRTime) pt.time) * 1000;
}

GpsPoint::~GpsPoint()
{
  /* destructor code */
}

/* readonly attribute float lat; */
NS_IMETHODIMP GpsPoint::GetLat(double *aLat)
{
    *aLat = lat;

    return NS_OK;
}

/* readonly attribute float lon; */
NS_IMETHODIMP GpsPoint::GetLon(double *aLon)
{
    *aLon = lon;
    
    return NS_OK;
}

/* readonly attribute long alt; */
NS_IMETHODIMP GpsPoint::GetAlt(double *aAlt)
{
    *aAlt = alt;

    return NS_OK;
}

/* readonly attribute PRTime time; */
NS_IMETHODIMP GpsPoint::GetTime(PRTime *aTime)
{
    *aTime = this->time;

    return NS_OK;
}

/* double speed (in IGPSPoint other); */
/* Return result in m/s */
NS_IMETHODIMP GpsPoint::Speed(IGPSPoint *other, double *_retval)
{
    if (!other)
	return NS_ERROR_NULL_POINTER;

    Trackpoint self = make_tpoint(this);
    Trackpoint otherp = make_tpoint(other);

    *_retval = self.speed(otherp);

    return NS_OK;
}

// Assume the other is sooner then now
// Return result in m/s
NS_IMETHODIMP GpsPoint::Vario(IGPSPoint *other, double *_retval)
{
    if (!other)
	return NS_ERROR_NULL_POINTER;
    
    Trackpoint selfp = make_tpoint(this);
    Trackpoint otherp = make_tpoint(other);
    
    *_retval = selfp.vario(otherp);

    return NS_OK;
}

/* Return distance in meters */
NS_IMETHODIMP GpsPoint::Distance(IGPSPoint *other, double *_retval)
{
    if (!other)
	return NS_ERROR_NULL_POINTER;

    Trackpoint selfp = make_tpoint(this);
    Trackpoint otherp = make_tpoint(other);

    *_retval = selfp.distance(otherp);

    return NS_OK;
}

/* Return distance in meters - optimized function to be called
 * frequently from javascript */
NS_IMETHODIMP GpsPoint::Distance_raw(double lat, double lon, double *_retval)
{
    Trackpoint selfp = make_tpoint(this);
    Trackpoint otherp;

    otherp.lat = lat;
    otherp.lon = lon;
    
    *_retval = selfp.distance(otherp);

    return NS_OK;
}


/* void initPoint (in double lat, in double lon, in double alt, in PRTime time); */
NS_IMETHODIMP GpsPoint::InitPoint(double lat, double lon, double alt, 
				  PRTime time)
{
    this->lat = lat;
    this->lon = lon;
    this->alt = alt;
    this->time = time;

    return NS_OK;
}

/* Make Trackpoint object from IGPSPoint object */
Trackpoint GpsPoint::make_tpoint(IGPSPoint *other)
{
    Trackpoint result;
    PRTime mtime;
    
    other->GetLat(&result.lat);
    other->GetLon(&result.lon);
    other->GetAlt(&result.gpsalt);
    other->GetTime(&mtime);
    result.baroalt = 0.0;
    result.time = mtime / 1000;

    return result;

}

