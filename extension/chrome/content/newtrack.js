// Complete tracklog
var tracklog;
// First points of selected tracks
var sel_track_ids;
// Tracklog containing only selected sub-tracks
var seltracklog;
// Tracklog containing only selected range from concatenated sub-tracks
var finaltracklog;
// True if we have saved a file
var track_save_fname = null;
// Additional information about flight
var dinfo;
// What should be focused in the flight information window
var fillfocus;


var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;

var citydb = Components.classes["@pgweb.cz/Gipsy/GPSCities;1"].getService().wrappedJSObject;

var near_site_list;

function loadTrackList() {
    // If we were called before initialization, bail out
    if (!tracklog)
	return;

    var dlist = document.getElementById('main_list');
    // Clear from list all items
    for (var i=dlist.childNodes.length-1; i >= 0; i--) {
	var node = dlist.childNodes[i];
	if (node.nodeName == 'listitem')
	    dlist.removeChild(node);
    }

    // Populate list with pieces of tracklog
    for (var i=0; i < tracklog.igcBreakCount(); i++) {
	var tpstart = tracklog.igcPoint(tracklog.igcBreak(i));
	var tlen = tracklog.igcBreakLen(i);
	var tpend = tracklog.igcPoint(tracklog.igcBreak(i) + tlen - 1);
	
	var item = document.createElement('listitem');
	item.setAttribute('value', i);
	if (gstore.isTrackInDb(tpstart))
	    item.setAttribute('class', 'seen');
	
	var cell1 = document.createElement('listcell');
	var cell2 = document.createElement('listcell');
	
	var startdate = new Date(tpstart.time);
	var enddate = new Date(tpend.time);
	
	cell1.setAttribute('label', startdate.toLocaleString() + ' - ' + enddate.toLocaleTimeString());
	cell2.setAttribute('label', 'Points: ' + tlen);
	
	item.appendChild(cell1);
	item.appendChild(cell2);
	
	dlist.appendChild(item);
	
	if (get_bool_pref('autoselecttoday')) {
            if (startdate.toLocaleFormat('%Y.%m.%d') == new Date().toLocaleFormat('%Y.%m.%d'))
                dlist.addItemToSelection(item);
        }
   }
    // TODO: Now select the first usable track

    // At least 5 minutes, height difference more then 50 meters,
    // passes time validation
}

// Setup main screen, invariantly whether reached as first page,
// or again from last screen
function main_shown() {
    document.getElementById('newtrk_window').canRewind=false;
    
    // If we got on first page by 'goto' from a last page, reinitialize
    // so that we get different colors on processed tracklogs
    if (track_save_fname != null) {
	loadTrackList();
	onsubtrackselect();
	track_save_fname = null;
    }
}


function OnLoad() {
    tracklog = window.arguments[0];

    if (tracklog.igcBreakCount() > 1) {
	loadTrackList();
    } else {
	// Hide all 'cont_proc' buttons
	elem('cont_proc').style.display = 'none';
	elem('cont_proc2').style.display = 'none';
	elem('cont_proc3').style.display = 'none';
	sel_track_ids = [0];
	if (tracklog.canModify) {
	    seltracklog = tracklog;
	    elem('newtrk_window').goTo('prepost_page');
	    restore_auto();
	} else {
	    finaltracklog = tracklog;
	    adv_to_flight_info();
	    elem('newtrk_window').goTo('flight_info_page');
	}
    }

    elem('w_gpsname').value = tracklog.igcGetParam('gpsname');
    elem('w2_gpsname').value = tracklog.igcGetParam('gpsname');
    elem('w3_gpsname').value = tracklog.igcGetParam('gpsname');

    // Fill out country list on the flight info wizard
    var clist = elem('country_input');
    for (var sc in Country_list) {
	clist.appendItem(Country_list[sc], sc);
    }
    // Fill out glider list on the flight info wizard
    var glist = document.getElementById('glider_input');
    for (var i=0; i < glider_list.length; i++)
	glist.appendItem(glider_list[i], '');

    // Attach mandatory handler to flight info page
    document.getElementById('flight_info_page').addEventListener('input', update_mandatory_pinfo, false);
}
window.onload = OnLoad;

function numsorter(a,b) 
{ 
    a = Number(a); b = Number(b);
    if (a < b)
	return -1;
    if (a > b)
	return 1;
    return 0;
}

// Show height profile on main subtrack selection
function onsubtrackselect()
{
    var dlist = document.getElementById('main_list');
    
    if (dlist.selectedCount == 0) {
	seltracklog = null;
    } else {
	sel_track_ids = [];
	var selection = [];
	for (var i=0; i < dlist.selectedItems.length; i++) {
	    var idx = dlist.selectedItems[i].value;
	    selection.push(idx);
	    
	    var startp = tracklog.igcBreak(idx);
	    sel_track_ids.push(tracklog.igcPoint(startp)); 
	}
	selection.sort(numsorter);
	seltracklog = tracklog.igcBreakSelect(selection.length, selection);
    }
    document.getElementById('selprofile').set_property('tracklog',seltracklog);
}

// Move from track selection to point selection
function onmainadvance()
{
    if (seltracklog == null)
	return false;

    restore_auto();
    
    return true;
}

// Setup auto-selection of track
function restore_auto()
{
    var flprofile = document.getElementById('flprofile');
    flprofile.set_property('tracklog', seltracklog);
    var startp = seltracklog.igcStripBegin();
    var endp = seltracklog.igcStripEnd();
    if (endp - startp < seltracklog.igcPointCount() * 0.1) {
	startp = 0;
	endp = seltracklog.igcPointCount() - 1;
    }
    flprofile.set_property('startpoint', startp);
    flprofile.set_property('endpoint',  endp);

    elem('basic_select').style.display = 'inline';
    elem('advanced_select').style.visibility = 'hidden';
    elem('sel_adv_button').disabled = false;
}

// Fill in sites/country input menu
// Return true if site selected
function prefill_sites(basepoint)
{
    var found = false;
    // Fill out nearest starts
    var sites = gstore.getNearestSites(basepoint);
    near_site_list = sites;

    var sitemenu = document.getElementById('site_input');
    sitemenu.removeAllItems();

    // Set up the nearest area list
    for (var i=0; i < sites.length; i++) {
	var item = document.createElement('menuitem');
	if (sites[i].distance < 1000)
	    var distance = format_m(sites[i].distance);
	else
	    var distance = sprintf(format_km(sites[i].distance));
	sitemenu.appendItem(sites[i].country + '/' + sites[i].site + ' (' + distance + ')', i);
    }

    if (sites.length > 0) {
	if (sites[0].distance < gstore.SITE_DISTANCE) {
	    site_menu_select(0);
	    found = true;
	} else // At least fill out country
	    site_menu_sel_country(sites[0].country);
    } else {
	// Try to guess country from city database
	var city = citydb.query_point(basepoint);
	if (city)
	    site_menu_sel_country(city.country);
    }
    return found;
}

function fill_pilot_info(info) {
    var items = [ 'pilot', 'glider', 'xcontestid', 'igccode' ];
    for (var i=0; i < items.length; i++) {
	var val = info[items[i]];
	var field = document.getElementById(items[i] + '_input');
	if (field.inputField)
	    field = field.inputField;
	field.value = val;
    }
    elem('biplace_input').checked = info.biplace;
    elem('xcontest_input').checked = info.xcontest_claim;
    elem('xcontestid_input').disabled = !info.xcontest_claim;
    if (info.longname && elem(info.longname))
	elem('file_format').selectedItem = elem(info.longname);
    else
	elem('file_format').selectedItem = elem('long');

    // Fill FAI class
    var menu = document.getElementById('faiclass_input');
    var items = menu.childNodes[0].childNodes;
    for (var i=0; i < items.length; i++)
	if (items[i].value == info.faiclass) {
	    menu.selectedItem = items[i];
	    break;
	}
}

// Prefill piliot, glider etc. information
// Return true if pilot found
function prefill_pilot(gpsunitid)
{
    var found = false;
    // Prefill last pilot name with this GPS
    var pilotid = gstore.getPilotByGps(gpsunitid);
    if (pilotid != null) {
	var saved_info = gstore.getPilotHistoryInfo(pilotid);
	fill_pilot_info(saved_info);
	found = true;
    }

    // Clear the pilots menu
    var pinputel = document.getElementById('pilot_input');
    pinputel.removeAllItems();

    // Fill out the pilots menu
    var plist = gstore.getInputPilots();
    for (var i=0; i < plist.length; i++) {
	pinputel.appendItem(plist[i][0], plist[i][1]);
    }
    return found;
}

function onfillshow()
{
    document.getElementById(fillfocus).focus();
    document.getElementById('fill_tabbox').selectedIndex = 0;
}

function adv_to_flight_info()
{
    // Select 'long' as default
    elem('file_format').selectedItem = elem('long');

    var sitefound = this.prefill_sites(finaltracklog.igcPoint(0));
    var pilotfound = this.prefill_pilot(finaltracklog.gpsunitid);

    if (!pilotfound)
	fillfocus = 'pilot_input';
    else if (!sitefound)
	fillfocus = 'site_input';
    else 
	fillfocus = 'comment_input';

    // Update the 'Finish' button
    update_mandatory_pinfo();
}

// choose final points, pre-fill next screen with sites,
// pilot etc.
function onpointsadvance()
{
    var dlist = document.getElementById('point_list');
    
    var selection = [];
    var flprofile = document.getElementById('flprofile');

    if (!elem('sel_adv_button').disabled) {
	// Basic selection
	for (var i=flprofile.startpoint; i <= flprofile.endpoint; i++)
	    selection.push(i);
    } else {
	// Advanced selection
	var sellist = flprofile.sellist;
	for (var i=0; i < sellist.length; i++)
	    if (sellist[i])
		selection.push(i);
    }

    if (selection.length == 0)
	return false;

    finaltracklog = seltracklog.igcSelectPoints(selection.length, selection);
    adv_to_flight_info();

    return true;
}

/* Check if all fields that are mandotory contain at least one character */
function check_mandatory()
{
    var arr = ['pilot', 'glider',  'site'];

    if (elem('xcontest_input').checked)
	arr.push('xcontestid');

    for (var i=0; i < arr.length; i++) {
	if (! elem(arr[i] + '_input').value)
	    return false;
    }
    

    // Check that igccode doesn't include non-ascii characters
    var igccode = elem('igccode_input').value.toUpperCase();
    for (var i=0; i < igccode.length; i++) 
	if (chr(igccode[i]) < chr('A') || chr(igccode[i]) > chr('Z'))
	    return false;
    
    return true;
}

/* Update fields mandatory warning and canadvance to next page */
function update_mandatory_pinfo()
{
    document.getElementById('newtrk_window').canAdvance = check_mandatory();
}

function onpageinfoadvance()
{
    if (!check_mandatory())
	return false;

    // Setup DINFO structure & add info to tracklog
    var arr = [ 'pilot', 'glider',  'comment', 'site', 'country' ];
    dinfo = new Object();
    for (var i=0; i < arr.length; i++) {
	var value = elem(arr[i] + '_input').value;
	finaltracklog.igcSetParam(arr[i], value);
	dinfo[arr[i]] = value;
    }
    var biplace = elem('biplace_input').checked;
    if (biplace)
	finaltracklog.igcSetParam('biplace', 'true');
    dinfo.biplace = biplace;

    var faiclassl = elem('faiclass_input').selectedItem.label;
    var faiclass = elem('faiclass_input').selectedItem.value;
    finaltracklog.igcSetParam('faiclass', faiclassl);
    dinfo.faiclass = faiclass;

    dinfo.xcontestid = elem('xcontestid_input').value;
    if (document.getElementById('xcontest_input').checked) {
	dinfo.synchro = gstore.SYNCHRO_ENABLED;
	finaltracklog.igcSetParam('xcontestid', dinfo.xcontestid);
    } else
	dinfo.synchro = gstore.SYNCHRO_NONE;

    dinfo.gpsunitid = finaltracklog.gpsunitid;

    dinfo.longname = elem('file_format').selectedItem.id;

    dinfo.xcontest_claim = elem('xcontest_input').checked;

    dinfo.igccode = elem('igccode_input').value.toUpperCase();

    // Save IGC
    var fname = gstore.saveIgcFile(finaltracklog, dinfo);

    // Add to database
    gstore.addNewIgc(finaltracklog, fname, dinfo, true);
    track_save_fname = fname;
    // DONE

    // Add information about the fields into history database, so that 
    // next time we can use it
    gstore.addInputInfo(dinfo);
    // Save information about processed tracks
    for (var i=0; i < sel_track_ids.length; i++)
	gstore.addTrackPartPoint(sel_track_ids[i]);
    
    if (dinfo.synchro == gstore.SYNCHRO_ENABLED) {
	elem('flight_info_page').next = 'xcontest_page';
	elem('x_fname').value = gstore.getFullIGCPath(fname);    } else {
	elem('flight_info_page').next = 'save_page';
	elem('w_fname').value = gstore.getFullIGCPath(fname);
    }
    
    return true;
}

// On selection about send flight now/later
function onxcontestpageadvance()
{
    var snow = document.getElementById('send_now');
    if (snow.selected) {
	document.getElementById('xcontest_page').next = 'xcontest_claim';
	flightclaim.tlog = finaltracklog;
	flightclaim.dinfo = dinfo;
	flightclaim.fname = track_save_fname;
	flightclaim.wizard = elem('newtrk_window');
    } else
	document.getElementById('xcontest_page').next = 'xcontest_done';

    return true;
}

// Select from menu country as specified by country code
function site_menu_sel_country(ccode)
{
    if (Country_list.hasOwnProperty(ccode)) {
	var i = 0;
	for (var country in Country_list) {
	    if (country == ccode) {
		// We have to set it after it is shown
		window.setTimeout(function() { elem('country_input').selectedIndex = i; }, 1);
		break;
	    }
	    i++;
	}
    }
}   

// Set up information on nearby launch site
function site_menu_select(idx)
{
    var dval = near_site_list[idx];
    var dmenu = document.getElementById('site_input');
    dmenu.inputField.value = dval.site;

    site_menu_sel_country(dval.country);
}

// Set up site information
function handle_site_menu(e)
{
    site_menu_select(e.target.value);
    update_mandatory_pinfo();
    
    return false;
}

// Fill out glider, xcontestid on pilot menu selection
function handle_pilot_select(event)
{
    var pinfo = gstore.getPilotHistoryInfo(event.target.value);
    if (pinfo != null) {
	fill_pilot_info(pinfo);
	update_mandatory_pinfo();
    }

    return true;
}
 
// Switch tracklog part selection to advanced mode  
function select_to_advanced() {
    var flprofile = elem('flprofile');
    elem('sel_adv_button').disabled = true;

    // Set alleged start as a middle of zoom
    var pcount = Math.round(flprofile.getAttribute('width') / 2);
    var zoompoint = flprofile.startpoint - Math.round(pcount / 2);
    if (zoompoint + pcount >= seltracklog.igcPointCount())
	zoompoint = seltracklog.igcPointCount() - pcount;
    if (zoompoint < 0)
	zoompoint = 0;
    var flprofile = elem('flprofile');

    flprofile.set_property('zoompoint', zoompoint);
    var selection = [];
    for (var i=0; i < seltracklog.igcPointCount(); i++) {
	if (i >= flprofile.startpoint && i <= flprofile.endpoint)
	    selection.push(true);
	else
	    selection.push(false);
    }
    flprofile.set_property('sellist', selection);

    elem('basic_select').style.display = 'none';
    elem('advanced_select').style.visibility = 'visible';
}
