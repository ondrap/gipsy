
// Tracklog download event
function open_tlog(tracklog)
{
    window.openDialog('chrome://gipsy/content/newtrack.xul', '_blank', 'dialog=no,chrome,modal=no,',tracklog);
}

// Callback on successful tracklog download
var tlog_observer = {
    observe : function(subject, topic, data) {
	if (topic == "gps_tracklog") {
	    // New downloaded tracklog
	    var tl = subject.QueryInterface(Components.interfaces.IGPSIGC);
	    open_tlog(tl);
	}
	
	if (topic == "gps_dbnewigc") {
	    tlog = subject.QueryInterface(Components.interfaces.IGPSIGC);
	    // TODO: Selective invalidation and insertion of
	    // correct flight into the tree
	    treeView.init();
	}
	if (topic == "gps_dbupdateigc") {
	    update_nonsync();
	    treeView.update_igc(data);
	    flightmodel.update();
	}
	if (topic == "gps_dbremoveigc") {
	    treeView.remove_igc(data);
	}
	if (topic == "gps_syncupdate") {
	    update_nonsync();
	    if (data)
		treeView.updateSync(data);
	}
    }
}

var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);

var initialized = false;
function OnLoad() {
    if (initialized)  // Armour against onload from inline browser
	return;
    initialized= true;
    
    if (!scanner) {
	window.location = 'chrome://gipsy/content/not_loaded.html';
	return;
    }
    if (!gstore) {
	window.location = 'chrome://gipsy/content/not_sql.html';
	return;
    }

    // Check DLL version
    var dll_version = 1;
    try {
	if (scanner.DLL_VERSION)
	    dll_version = scanner.DLL_VERSION;
    } catch (e) { }
    if (dll_version == 1) {
	elem('mlr_gps').parentNode.removeChild(elem('mlr_gps'));
	elem('flymaster_gps').parentNode.removeChild(elem('flymaster_gps'));
    }

    // Check db version
    if (!gstore.checkDBVersion()) {
	if (confirm('Wrong version of flight database found! Upgrade database?'))
	    if (!gstore.updateDB())
		alert('Upgrade failed. Remove flights.db and restart firefox.');
    }

    observerService.addObserver(tlog_observer, "gps_tracklog", false);
    observerService.addObserver(tlog_observer, "gps_dbnewigc", false);
    observerService.addObserver(tlog_observer, "gps_dbupdateigc", false);
    observerService.addObserver(tlog_observer, "gps_dbremoveigc", false);
    observerService.addObserver(tlog_observer, "gps_syncupdate", false);

    // Add view to the tree
    init_flight_tree();

    rescan_dir();
    update_nonsync();
    update_maptype();

    // initalize GPS device tree
    init_gpstree();

    if (get_bool_pref('extfunc'))
	elem('gpxthermals').style.display = '-moz-box';
    if (gstore.OS == 'WINNT')
	elem('popup_launch').style.display = '-moz-box';
    ctx_setup_usercmd();
}

function ctx_setup_usercmd() {
    for (var num=1; num < 4; num++) {
        if (get_string_pref('usercmd_' + num + '_title') && get_string_pref('usercmd_' + num + '_cmd')) {
            elem('ctx_usercmd' + num).style.display = '-moz-box';
            elem('ctx_usercmd' + num).label = get_string_pref('usercmd_' + num + '_title');
        } else {
            elem('ctx_usercmd' + num).style.display = 'none';
        }
    }
    
}

// Uff..rescan of the input directory takes a long time, 
// so make it one file at time with a window.timeout
var _next;
function rescan_dir() {
    if (_next != null)
	return;
    window.setTimeout(_rescanner, 1);
    function _rescanner() {
	_next = gstore.rescanDir(_next);
	if (_next)
	    window.setTimeout(_rescanner, 1);
    }
}

function OnUnload() {
    if (!scanner) // If we failed to load, don't unload
	return; 
    observerService.removeObserver(tlog_observer, "gps_tracklog");
    observerService.removeObserver(tlog_observer, "gps_dbnewigc");
    observerService.removeObserver(tlog_observer, "gps_dbremoveigc");
    observerService.removeObserver(tlog_observer, "gps_dbupdateigc");
    observerService.removeObserver(tlog_observer, "gps_syncupdate");

    unload_gpstree();
}
window.onload = OnLoad;
window.onunload = OnUnload;

// Start download on GPS
function start_download(pos)
{
    scanner.gpsDownload(pos);
}

// Ask GPS to instantiate a tracklog processing again
function reprocess_gps(pos)
{
    scanner.gpsReprocess(pos);
}

// Update non-synchronized counter
function update_nonsync()
{
    var spanel = elem('synchro_panel');
    var smenu = elem('xsend_menu');

    var noncount = gstore.synchroFlights();
    if (noncount.length == 0) {
	spanel.style.display = 'none';
	smenu.setAttribute('disabled', true);
    } else {
	spanel.style.display = '-moz-box';
	spanel.label = elem('bundle').getFormattedString('schedfiles', [noncount.length]);
	smenu.setAttribute('disabled', false);
    }
}

// Initialize map according to checkbox/radiobox states
function update_maptype() {
    var flmap = elem('mapcontainer');
    var maps = ['map_googlemap', 'map_googlesat', 'map_nomap',
		'map_pgweb', 'map_terrain' ];
    for (var i=0; i < maps.length; i++) {
	if (elem(maps[i]).selected) {
	    flmap.set_property('maptype', maps[i]);
	    var maptype = maps[i];
	    break;
	}
    }
    var flov = elem('map_overlay');
    if (maptype == 'map_googlesat' || 
	maptype == 'map_pgweb' || maptype == 'map_terrain') {
	flov.disabled = false;
	if (flov.checked)
	    flmap.set_property('mapoverlay', 'map_googleoverlay');
	else
	    flmap.set_property('mapoverlay', null);
    } else {
	flov.disabled = true;
	flmap.set_property('mapoverlay', null);
    }

    var flairspace = elem('map_airspace');
    if (maptype != 'map_nomap') {
	flairspace.disabled = false;
	if (flairspace.checked)
	    flmap.set_property('mapairspace', 'map_airspace');
	else
	    flmap.set_property('mapairspace', null);
    } else {
	flairspace.disabled = true;
	flmap.set_property('mapairspace', null);
    }
}

function import_gpx() {
    var nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
    fp.init(window, "Open", nsIFilePicker.modeOpen);
    var res = fp.show();
    if (res == fp.returnOK) {
	var tlog = Components.classes["@pgweb.cz/Gipsy/GPSIGC;1"].createInstance(Components.interfaces.IGPSIGC);
	tlog.igcLoadGPX(fp.file);
	// TODO: pouze, pokud obsahuje body
	open_tlog(tlog);
    }
}

function download_map_definitions() {
    xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function()   { 
	if(xhr.readyState == 4 && xhr.status == 200)   {
	    var text = xhr.responseText;
	    var lines = text.split('\n');
	    for (var i=0; i < lines.length; i++) {
		var fields = lines[i].split(':');
		if (fields.length == 2) {
		    set_string_pref(fields[0], fields[1]);
		}
	    }
	    alert('Map URLs updated.');
	} else if (xhr.readyState == 4) {
	    alert('Error downloading map URLs: ' + xhr.status);
	}
    }
    xhr.open("GET", "http://paragliding.iglu.cz/download/gipsy/maps.txt", true);
    xhr.send(null); 
}

// Initialize global variables
try {
    var scanner = Components.classes["@pgweb.cz/Gipsy/GPSsight;1"].getService(Components.interfaces.IGPSScanner);
    
    var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;
} catch (e) { }
