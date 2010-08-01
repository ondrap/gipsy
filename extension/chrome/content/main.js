
// Tracklog download event
function open_tlog(tracklog)
{
    window.openDialog('chrome://gipsy/content/newtrack.xul', '_blank', 'dialog=no,chrome,modal=no,', tracklog);
}

// Callback on successful tracklog download
var tlog_observer = {
    observe : function(subject, topic, data) {
	if (topic == "gps_tracklog") {
	    // New downloaded tracklog
	    var tl = subject.QueryInterface(Components.interfaces.IGPSIGC);
	    open_tlog(tl);
	}
        if (topic == "gps_trackdownsel") {
            // Selection of tracklog to download
            gps = subject.QueryInterface(Components.interfaces.IGPSDevInfo);
            window.openDialog('chrome://gipsy/content/trackdownsel.xul', '_blank', 'dialog=no,chrome,modal=no,', gps);
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
    if (!scanner.gpsCryptoEnabled()) {
        var warning = document.createElement('label');
        warning.setAttribute('value',  'WARNING: Downloaded tracklgos will be without G-Record!!');
        warning.style.color = 'red';
        elem('statusbar').appendChild(warning);
    }

    // Check db version
    if (!gstore.checkDBVersion()) {
	if (confirm('Old version of flight database found! Upgrade database?'))
	    if (!gstore.updateDB())
		alert('Upgrade failed. Remove flights.db and restart firefox.');
    }

    observerService.addObserver(tlog_observer, "gps_tracklog", false);
    observerService.addObserver(tlog_observer, "gps_dbnewigc", false);
    observerService.addObserver(tlog_observer, "gps_dbupdateigc", false);
    observerService.addObserver(tlog_observer, "gps_dbremoveigc", false);
    observerService.addObserver(tlog_observer, "gps_syncupdate", false);
    observerService.addObserver(tlog_observer, "gps_trackdownsel", false);

    // Add view to the tree
    init_flight_tree();

    rescan_dir();
    update_nonsync();
    create_gmap();
    update_maptype();

    // initalize GPS device tree
    init_gpstree();

    if (get_bool_pref('extfunc')) {
	elem('gpxthermals').style.display = '-moz-box';
	elem('map_weather').style.display = '-moz-box';
    }
    if (gstore.OS == 'WINNT')
	elem('popup_launch').style.display = '-moz-box';
    ctx_setup_usercmd();
    
    add_trackcolors_to_css();
}

// Add background for flighttree into CSS so we have correct backgrounds
function add_trackcolors_to_css() {
    var sheet = document.styleSheets[0];
    var totalrules = sheet.cssRules.length;
    for (var i=0; i < 6; i++) {
        var selector = sprintf("treechildren::-moz-tree-row(selected, flight_%d)", i);
        var rule = sprintf("{ background-color: %s;}", track_color(i));
        sheet.insertRule(selector + rule, totalrules - 1);
    }
}

var gmap;
var gprofile;
function create_gmap() {
    gmap = new TerrainMap('gmap');
    gprofile = new TracklogProfile('gprofile', 100);
    gprofile.add_eventhandler(show_point);
}

function set_text(elname, text) {
    var el = elem(elname);
    empty(el);
    var node = document.createTextNode(text);
    el.appendChild(node);
}

function _fmttime(time) {
    return sprintf('%02d:%02d:%02d UTC', time.getUTCHours(), 
                    time.getUTCMinutes(), time.getUTCSeconds());
}

function show_point(points) {
    // Update speed + vario in points structures
    for (var i=0; i < points.length; i++) {
        var tlog = points[i].tlog;
        var pidx = points[i].pidx;
        var point = tlog.igcPoint(pidx);
        
        if (pidx > 0) {
            var prevpoint = tlog.igcPoint(pidx - 1);
            points[i].speed = point.speed(prevpoint);
            
            // Do 5-second averaging - find point 5 seconds ago
            for (var j=pidx - 2; j > 0; j--) {
                var newpoint = tlog.igcPoint(j);
                if (point.time - newpoint.time > 5 * 1000)
                    break;
                prevpoint = newpoint;
            }
            points[i].vario = point.vario(prevpoint);
        }
    }
    
    show_point_data(points);
    gmap.mark_positions(points);
    update_weather(points[0].tlog.igcPoint(points[0].pidx).time);
}

var cached_weather = new Array();
var active_weather_link = null;

function reset_weather() {
    cached_weather = new Array();
    active_weather_link = null;
    gmap.set_overlay(null);
}

// Update weather images
function update_weather(time) {
    if (!elem('map_weather').checked) {
        gmap.set_overlay(null);
        return;
    }
    
    var weather = create_weather_link(time);
    active_weather_link = weather.link;

    if (cached_weather[weather.link] != null) {
        gmap.set_overlay(cached_weather[weather.link]);
        return;
    }
    // Load image
    var image = new Image();
    image.src = weather.link;
    weather.image = image;
    image.onload = function() {
        // Add image to cached images
        cached_weather[weather.link] = weather;
        // set overlay only if still active
        if (weather.link == active_weather_link)
            gmap.set_overlay(weather);
    }
}

function create_weather_link(time) {
    // Weather link
    time = new Date(time);
    var date = sprintf('%d%02d%02d', time.getUTCFullYear(), time.getUTCMonth() + 1, time.getUTCDate());
    var minute = Math.floor(time.getUTCMinutes() / 15) * 15;
    var timepart = sprintf('%02d%02d', time.getUTCHours(), minute);
    
    var weather = {
        //link :  'http://xcontest.fedra.cz/igconmsg/msg.png', // Calibration
        link : 'http://xcontest.fedra.cz/igconmsg/msgs/msgcz.vis-ir.' + date + '.' + timepart + '.0.jpg',
        topleftlat : 52.6,
        topleftlon : 9.34,
        bottomrightlat : 47.1,
        bottomrightlon : 20.3
        };
    return weather;
    
    
    /*
    var noaa = {
        link :  'file:///tmp/rgb.jpg', // Calibration
        topleftlat : 51.5,
        topleftlon : 11.93,
        bottomrightlat : 48.05,
        bottomrightlon : 19.05
        };
    gmap.set_overlay(noaa);
    */
}

function show_point_data(points) {
    var tlog = points[0].tlog;
    var pidx = points[0].pidx;

    var point = tlog.igcPoint(pidx);
    set_text('prof-time',  _fmttime(new Date(point.time)));
    
    if (points.length > 1 || pidx == 0 || points[0].speed == null) {
        set_text('prof-alt', '');
        set_text('prof-speed', '');
        set_text('prof-vario', '');
        return;
    }

    set_text('prof-alt', format_m(point.alt));
    set_text('prof-speed', format_kmh(points[0].speed));
    set_text('prof-vario', format_ms(points[0].vario));
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
    observerService.removeObserver(tlog_observer, "gps_trackdownsel");

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
    var layers = [];
    var maptype;
    var maps = ['map_googlemap', 'map_googlesat', 'map_pgweb', 'map_terrain' ];
    for (var i=0; i < maps.length; i++) {
	if (elem(maps[i]).selected) {
            maptype = maps[i];
            layers.push(maptype);
	    break;
	}
    }

    var flov = elem('map_overlay');
    if (maptype == 'map_googlesat' || 	maptype == 'map_pgweb') {
	flov.disabled = false;
	if (flov.checked)
	    layers.push('map_googleoverlay');
    } else
	flov.disabled = true;

    var flairspace = elem('map_airspace');
    if (maptype != 'map_nomap') {
	flairspace.disabled = false;
	if (flairspace.checked)
	    layers.push('map_airspace');
    } else
	flairspace.disabled = true;
    
    gmap.set_layers(layers);
    gmap.set_showopt(elem('map_optimization').checked);
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
