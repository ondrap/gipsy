/* Module for exporting tracklogs to XML files */

const nsISupports = Components.interfaces.nsISupports;

// You can change these if you like
const CLASS_ID = Components.ID("b60dfd97-ad5f-4959-a572-801935b02317");
const CLASS_NAME = "GPX support class";
const CONTRACT_ID = "@pgweb.cz/Gipsy/GPSGpx;1";

var initialized = null;

// This is your constructor.
// You can do stuff here.
function GPSGpx() {
    // Load javascript utilities
    if (!initialized) {
	initialized = true;
	var loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"].getService(Components.interfaces.mozIJSSubScriptLoader);
	loader.loadSubScript('chrome://gipsy/content/util.js');
    }

    this.tracklogs = [];
    this.wrappedJSObject = this;
}

// This is the implementation of your component.
GPSGpx.prototype = {
    kmlns : 'http://earth.google.com/kml/2.2',
    /* GPX format functions */
    makeTime : function(name, date, ns) {
	var str = sprintf("%4d-%02d-%02dT%02d:%02d:%02dZ", 
			  1900+date.getYear(), 
			  date.getUTCMonth()+1, date.getUTCDate(),
			  date.getUTCHours(), date.getUTCMinutes(),
			  date.getUTCSeconds());
        if (ns)
            var el = this.doc.createElementNS(ns, name);
        else
            var el = this.doc.createElement(name);
	el.appendChild(this.doc.createTextNode(str));

	return el;
    },
    
    makeTrack : function(tlog, dinfo) {
	var root = this.doc.createElement('trk');

	var file = dinfo.file.split('/').pop();
	this.txtel(root, 'name', file);

	var text = tlog.igcGetParam('site') + ' (' + tlog.igcGetParam('country') + '), ' + tlog.igcGetParam('pilot') + ', ' + tlog.igcGetParam('glider');
	this.txtel(root, 'desc', text);

	this.txtel(root, 'src', tlog.igcGetParam('a_record'));
	this.txtel(root, 'type', tlog.igcGetParam('faiclass'));

	var trkseg = this.newel(root, 'trkseg');
	for (var i=0; i < tlog.igcPointCount(); i++) {
	    var point = tlog.igcPoint(i);

	    var trkpt = this.newel(trkseg, 'trkpt');
	    trkpt.setAttribute('lat', point.lat);
	    trkpt.setAttribute('lon', point.lon);

	    if (point.alt != 0)
		this.txtel(trkpt, 'ele', point.alt);

	    var time = this.makeTime('time', new Date(point.time));
	    trkpt.appendChild(time);

	    // Add name of the first trackpoint as launch
	    if (i == 0)
		this.txtel(trkpt, 'name', 'Launch');
	    else if (i == tlog.igcPointCount() - 1)
		this.txtel(trkpt, 'name', 'Landing');
	}

	return root;
    },

    addGpxThermal : function(root, thermals) {
	for (var i=0; i < thermals.length; i++) {
	    var stpoint = thermals[i].stpoint;
	    var endpoint = thermals[i].endpoint;

	    var wpt = this.newel(root, 'wpt');
	    wpt.setAttribute('lat', stpoint.lat);
	    wpt.setAttribute('lon', stpoint.lon);
	    this.txtel(wpt, 'ele', stpoint.alt);

	    var date = new Date(thermals[i].stpoint.time);
	    var name = sprintf('%02d:%02d %.1f', date.getUTCHours(), date.getUTCMinutes(),
			       thermals[i].strength);
	    this.txtel(wpt, 'name', name);
	    var comment = sprintf('%d.%d.%d +%d', date.getUTCDate(), date.getUTCMonth()+1, 
				  1900+date.getYear(), endpoint.alt - stpoint.alt);
	    this.txtel(wpt, 'cmt', comment);
	}
    },

    createHtmlDOM : function(type) {
	const ns = 'http://www.w3.org/1999/xhtml';
	var root = this.doc.createElementNS(ns, 'html');
	this.doc.appendChild(root);

        var head = this.newel(root, 'head');
        var style = this.newel(head, 'style');
        style.setAttribute('type', 'text/css');
        var st = this.doc.createTextNode('\
                table { border-collapse: collapse; font: 10pt Arial;width: 100%; }\
                td, th { border: thin solid darkgray; } \
                thead *, tfoot * { font-weight: normal; text-align: left;background: lightgrey; } \
        ');
        style.appendChild(st);

	var body = this.newel(root, 'body');
	var table = this.newel(body, 'table');
	
	var thead = this.newel(table, 'thead');
	var head = this.newel(thead, 'tr');
	this.txtel(head, 'th', 'Date');
	this.txtel(head, 'th', 'Pilot');
	this.txtel(head, 'th', 'Glider');
	this.txtel(head, 'th', 'Launch');
	this.txtel(head, 'th', 'Landing');
	this.txtel(head, 'th', 'Duration');
	this.txtel(head, 'th', 'League');
	this.txtel(head, 'th', 'Route');
	this.txtel(head, 'th', 'Distance');
	this.txtel(head, 'th', 'Points');
	this.txtel(head, 'th', 'Comment');

        var tbody = this.newel(table, 'tbody');
        var totduration = 0;
        var totdistance = 0;
        var totpoints = 0;
	for (var i=0; i < this.tracklogs.length; i++) {
	    var row = this.newel(tbody, 'tr');

	    var tlog = this.tracklogs[i].tracklog;
	    var dinfo = this.tracklogs[i].dinfo;
	    var opt = this.tracklogs[i].optinfo;
	    
	    var date = new Date(tlog.igcPoint(0).time);
	    var datetxt = sprintf('%d.%d.%d', date.getUTCDate(), date.getUTCMonth()+1, 
				  1900+date.getYear());
	    this.txtel(row, 'td', datetxt);

	    this.txtel(row, 'td', dinfo.pilot);
	    this.txtel(row, 'td', dinfo.glider);
	    this.txtel(row, 'td', dinfo.site + '(' + dinfo.country + ')');
	    this.txtel(row, 'td', dinfo.landing);

	    var duration = tlog.igcPoint(tlog.igcPointCount()-1).time - tlog.igcPoint(0).time;
            totduration += duration;
	    duration = new Date(duration);
	    duration = sprintf("%02d:%02d:%02d", duration.getUTCHours(), duration.getUTCMinutes(), 
			       duration.getUTCSeconds());
	    this.txtel(row, 'td', duration);
	    
	    if (!opt) {
                this.txtel(row, 'td', '');this.txtel(row, 'td', '');this.txtel(row, 'td', '');this.txtel(row, 'td', '');
            } else {
                var dsum = opt.drawScore;
                this.txtel(row, 'td', dsum.scoreLeague);
                this.txtel(row, 'td', dsum.scoreShape);
                totdistance += opt.drawScore.scoreDistance;
                this.txtel(row, 'td', format_km2(opt.drawScore.scoreDistance * 1000));
                totpoints += opt.drawScore.scorePoints;
                this.txtel(row, 'td', sprintf('%.2f', opt.drawScore.scorePoints));
            }
	    this.txtel(row, 'td', tlog.igcGetParam('comment'));
	}
	
	var tfoot = this.newel(table, 'tfoot');
	var row = this.newel(tfoot, 'tr');
	
	for (var i=0;i < 5; i++)
            this.newel(row, 'td');
        var duration = new Date(totduration);
        var hours = Math.floor(duration.getTime() / (1000 * 3600));
        duration = sprintf("%02d:%02d:%02d", hours, duration.getUTCMinutes(), 
                            duration.getUTCSeconds());
        this.txtel(row, 'td', duration);
        // Skip 2
        this.newel(row, 'td');this.newel(row, 'td');
        // Add distance & points
        this.txtel(row, 'td', format_km2(totdistance * 1000));
        this.txtel(row, 'td', sprintf('%.2f', totpoints));
        this.newel(row, 'td');
    },

    createGpxDOM : function(type) {
	const ns = 'http://www.topografix.com/GPX/1/1';

	var root = this.doc.createElementNS(ns, 'gpx');
	this.doc.appendChild(root);

	root.setAttribute('version', '1.1');
	root.setAttribute('creator', 'GiPSy http://www.xcontest.org/gipsy/');

	root.setAttributeNS('http://www.w3.org/2001/XMLSchema-instance',
			    'schemaLocation', 
			    'http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd');

	var metadata = this.newel(root, 'metadata');
	metadata.appendChild(this.makeTime('time', new Date()));

	if (type == 'tracklog') {
	    for (var i=0; i < this.tracklogs.length; i++) {
		var track = this.makeTrack(this.tracklogs[i].tracklog, 
					   this.tracklogs[i].dinfo);
		root.appendChild(track);
	    }
	} else { // 'thermals'
	    var thermals = [];
	    for (var i=0; i < this.tracklogs.length; i++) {
		thermals = thermals.concat(this.detectThermals(this.tracklogs[i].tracklog));
	    }
	    thermals = this.filterThermals(thermals);
	    this.addGpxThermal(root, thermals);
	}
    },

    /* Google earth format functions */

    kmlStyle : function(color, width) {
	var st = this.doc.createElement('Style');

	var lst = this.newel(st, 'LineStyle');
	this.txtel(lst, 'color', color);
	if (width == null)
	    width = 3;
	this.txtel(lst, 'width', width);

	return st;
    },

    createKmlGxTrack : function(tlog, name, alttype, color) {
        var gxns = 'http://www.google.com/kml/ext/2.2';
        var placemark = this.doc.createElement('Placemark');

        this.txtel(placemark, 'name', name);
        this.txtel(placemark, 'visibility', '1');

        placemark.appendChild(this.kmlStyle(color));
        
        var gxtrack = this.newel(placemark, 'Track', gxns);
        this.txtel(gxtrack, 'altitudeMode', alttype, this.kmlns);
        
        for (var i=0; i < tlog.igcPointCount(); i++) {
            var point = tlog.igcPoint(i);

            gxtrack.appendChild(this.makeTime('when', new Date(point.time), this.kmlns));
            var coordtxt = point.lon + ' ' + point.lat + ' ' + point.alt;
            var coord = this.doc.createElementNS(gxns, 'coord');
            var txt = this.doc.createTextNode(coordtxt);
            coord.appendChild(txt);
            gxtrack.appendChild(coord);
        }


        return placemark;
    },

    createKmlTrack : function(tlog, name, alttype, color) {
	var placemark = this.doc.createElement('Placemark');

	this.txtel(placemark, 'name', name);
	this.txtel(placemark, 'visibility', '1');

	placemark.appendChild(this.kmlStyle(color));

	var listr = this.newel(placemark, 'LineString');
	this.txtel(listr, 'altitudeMode', alttype);
	if (alttype == 'clampToGround')
            this.txtel(listr, 'tessellate', '1');

	var ctext = tlog.kmlTrack();

	this.txtel(listr, 'coordinates', ctext);
	
	return placemark;
    },

    makeHtmlLine : function(name, value) {
	var sstr = '<tr><td><b>%s:</b></td><td>&nbsp;</td><td>%s</td></tr>';
	return sprintf(sstr, name, value);
    },

    makeHtmlDescr : function(tlog, dinfo) {
	var content = '';
	content += this.makeHtmlLine('Pilot', dinfo.pilot);
	content += this.makeHtmlLine('Glider', dinfo.glider);

	var spoint = tlog.igcPoint(0);

	var date = new Date(spoint.time);
	var tdate = sprintf('%d.%d.%d', date.getUTCDate(), date.getUTCMonth()+1,
			   1900+date.getYear());
	content += this.makeHtmlLine('Date', tdate);
	
	var lt = sprintf('%d:%d UTC, %d&nbsp;m', date.getUTCHours(), date.getUTCMinutes(), spoint.alt);
	content += this.makeHtmlLine('Launch', lt + ', ' + dinfo.site + ' (' + dinfo.country + ')');

	var epoint = tlog.igcPoint(tlog.igcPointCount() - 1);
	date = new Date(epoint.time);
	lt = sprintf('%d:%d UTC, %d m', date.getUTCHours(), date.getUTCMinutes(), epoint.alt);
	content += this.makeHtmlLine('Landing', lt + ', ' + dinfo.landing);
	
	var ndate = new Date(epoint.time - spoint.time);
	var duration = sprintf('%d h %d min', ndate.getUTCHours(), ndate.getUTCMinutes());
	content += this.makeHtmlLine('Duration', duration);

	content += this.makeHtmlLine('Max Alt', tlog.igcGetStat(tlog.STAT_HEIGHT_MAX) + ' m');

	var msp = sprintf(format_kmh(tlog.igcGetStat(tlog.STAT_SPEED_MAX)));
	content += this.makeHtmlLine('Max Speed', msp);
	
	var vmax = tlog.igcGetStat(tlog.STAT_VARIO_MAX);
	var vmin = tlog.igcGetStat(tlog.STAT_VARIO_MIN);
	content += this.makeHtmlLine('Vario Max/Min', sprintf('%.1f/%.1f m/s', vmax, vmin));

	var dist = sprintf("%.1f km", tlog.igcGetStat(tlog.STAT_DIST_STARTLAND) / 1000);
	content += this.makeHtmlLine('Launch-landing distance', dist);
	

	var text = '<table border="0">'+content+'</table>' ;
	text += tlog.igcGetParam('comment');

	return text;
    },

    createKmlPoint : function(name, icon, point, hsx, hsy, mode) {
	var pl = this.doc.createElement('Placemark');
	this.txtel(pl, 'name', name);
	
	var st = this.newel(pl, 'Style');
	var icst = this.newel(st, 'IconStyle');
	this.txtel(icst, 'scale', 0.6);
	var iccont = this.newel(icst, 'Icon');
	this.txtel(iccont, 'href', icon);
	
	if (hsx != null) {
	    var hs = this.newel(icst, 'hotSpot');
	    hs.setAttribute('x', hsx);
	    hs.setAttribute('y', hsy);
	    hs.setAttribute('xunits', 'fraction');
	    hs.setAttribute('yunits', 'fraction');
	}

	var po = this.newel(pl, 'Point');
	if (mode == null)
            this.txtel(po, 'altitudeMode', 'absolute');
        else
            this.txtel(po, 'altitudeMode', mode);
	this.txtel(po, 'coordinates', point.lon + ',' + point.lat + ',' + point.alt);

	return pl;
    },
    
    drawKmlLine : function(p1, p2, alttype, color) {
        var placemark = this.doc.createElement('Placemark');

        this.txtel(placemark, 'name', 'Route');
        this.txtel(placemark, 'visibility', '1');

        placemark.appendChild(this.kmlStyle(color));

        var listr = this.newel(placemark, 'LineString');
        this.txtel(listr, 'altitudeMode', alttype);
        if (alttype == 'clampToGround')
            this.txtel(listr, 'tessellate', '1');
        

        var ctext = p1.lon + ',' + p1.lat + ',' + p1.alt + '\n';
        ctext += p2.lon + ',' + p2.lat + ',' + p2.alt + '\n';
        this.txtel(listr, 'coordinates', ctext);
        
        return placemark;

    },
    
    optinfoKml : function(opt) {
        var folder = this.doc.createElement('Folder');
        this.txtel(folder, 'name', 'Optimal route');
        this.txtel(folder, 'visibility', '1');

        for (var i=0; i < opt.drawPoints.length; i++) {
            folder.appendChild(this.createKmlPoint('Turnpoint',
                                                    'http://www.pgweb.cz/img/maps/turnpoint.png', 
                                                    { lon : opt.drawPoints[i][1], lat : opt.drawPoints[i][0], alt : 0}, 
                                                    0.5, 0, 'clampToGround'));
        }
        for (var i=0; i < opt.drawLines.length; i++) {
            var p1 = { lat : opt.drawLines[i][0][0], lon : opt.drawLines[i][0][1], alt: 0 };
            var p2 = { lat : opt.drawLines[i][1][0], lon : opt.drawLines[i][1][1], alt: 0 };
            folder.appendChild(this.drawKmlLine(p1, p2, 'clampToGround', 'ff0000ff'));
        }
        return folder;
    },

    isthermal : function(tlog, st) {
	// 60 seconds raising at least 10 meters
	const interval = 60000;
	const raise = 10;

	var stpoint = tlog.igcPoint(st);
	var endtime = stpoint.time + interval;

	for (var i=st; i < tlog.igcPointCount(); i++) {
	    var point = tlog.igcPoint(i);
	    if (point.time > endtime) {
		if (point.alt > stpoint.alt + raise )
		    return true;
		return false;
	    }
	}
	return false;
    },

    detectThermals : function(tlog) {
	var result = [];

	var therstart = null;

	for (var i=0; i < tlog.igcPointCount() - 1; i++) {
	    if (therstart == null && tlog.igcPoint(i+1).vario(tlog.igcPoint(i)) > 1
		&& this.isthermal(tlog, i))
		therstart = i;
	    else if (therstart != null && !this.isthermal(tlog, i)) {
		var stpoint = tlog.igcPoint(therstart);
		var endpoint = tlog.igcPoint(i);
		var strength = stpoint.vario(endpoint);
		
		if (strength < 1.0) { 
                    // skip small thermails
		    therstart = null;
		    continue;
		}
		// skip finding the thermail
		for (; therstart < i; therstart++) {
		    var stpoint = tlog.igcPoint(therstart);
		    if (stpoint.vario(tlog.igcPoint(therstart+1)) >= strength)
			break;
		}
		if (therstart == i) {
		    therstart = null;
		    continue;
		}
		therstart = null;
		
		result.push({//TODO: direction
		    stpoint : stpoint,
		    endpoint : endpoint,
		    strength : stpoint.vario(endpoint)
		});
	    }
	}
	return result;
    },

    createKmlThermals : function(tlog) {
	var thermals = this.detectThermals(tlog);

	var pl = this.doc.createElement('Placemark');
	this.txtel(pl, 'name', 'Thermals');
	this.txtel(pl, 'visibility', '1');
	pl.appendChild(this.kmlStyle('a04040ff', 10));

	var multi = this.newel(pl, 'MultiGeometry');

	for (var i=0; i < thermals.length; i++) {
	    var listr = this.newel(multi, 'LineString');
	    this.txtel(listr, 'altitudeMode', 'absolute');

	    var stpoint = thermals[i].stpoint;
	    var endpoint = thermals[i].endpoint;
	
	    var ctext = sprintf("%d,%d,%d", stpoint.lon,stpoint.lat,stpoint.alt) + '\n';
	    ctext += sprintf("%d,%d,%d", endpoint.lon,endpoint.lat,endpoint.alt);
	    this.txtel(listr, 'coordinates', ctext);
	}

	return pl;
    },

    createKmlTimestamps : function(tlog) {
	const interval = 600000; // 10 minutes
	var folder = this.doc.createElement('Folder');
	this.txtel(folder, 'name', 'Time marks');
	this.txtel(folder, 'visibility', '0');

	var mtime = tlog.igcPoint(0).time;
	for (var i=1; i < tlog.igcPointCount(); i++) {
	    var point = tlog.igcPoint(i);
	    if (point.time > mtime + interval) {
		mtime = point.time;

		var date = new Date(point.time);
		date = sprintf('%02d:%02d:%02d', date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
		
		var point = this.createKmlPoint(date + ' ' + point.alt + 'm',
						'http://maps.google.com/mapfiles/kml/pal4/icon24.png', 
						point);
		this.txtel(point, 'visibility', '0');
		folder.appendChild(point);
	    }
	}
	return folder;
    },
    
    createKmlFolder : function(tlog, dinfo, number) {
        var folder = this.doc.createElement('Folder');
        const colors = [ 'ff00a5ff', 'ffa500ff', 'ffa5ff00', 'ffff4040',
                            'ff00ffa5', 'ffff00a5', 'ffffa500', 'ff4040ff',
                            'ff40ff40', 'ffa5a500', 'ffa500a5', 'ff00a5a5'];

        this.txtel(folder, 'name', dinfo.file.split('/').pop());
        var des = this.newel(folder, 'description');
        des.appendChild(this.doc.createCDATASection(this.makeHtmlDescr(tlog, dinfo)));

        folder.appendChild(this.createKmlGxTrack(tlog, 'GPS Tracklog', 
                                                 'absolute', colors[number % colors.length]));
        folder.appendChild(this.createKmlTrack(tlog, 'GPS Tracklog - line', 
                                                'absolute', colors[number % colors.length]));
        folder.appendChild(this.createKmlTrack(tlog, 'Ground shadow', 
                                                'clampToGround', 'ff101010'));

        folder.appendChild(this.createKmlPoint('Launch: ' + dinfo.site, 
                                                'http://www.pgweb.cz/img/maps/start.png', 
                                                tlog.igcPoint(0), 0.5, 0));

        var date = new Date(tlog.igcPoint(0).time);
        date = sprintf('%d.%d.%d', date.getUTCDate(), date.getUTCMonth()+1, 1900+date.getYear());
        folder.appendChild(this.createKmlPoint(dinfo.pilot + ' ' + date, 
                                                'http://www.pgweb.cz/img/maps/cil.png', 
                                                tlog.igcPoint(tlog.igcPointCount() - 1 ), 0.5, 0));


        folder.appendChild(this.createKmlThermals(tlog));
        folder.appendChild(this.createKmlTimestamps(tlog));

        return folder;
    },

    // Filter thermals to get a reasonable subset
    filterThermals : function(thermals) {
	const undup_distance = 200;
	const min_gain = 200;
	const min_strength = 1.5;
	const slow_up = 400; // If less then min_strength, but more height gain
	
	var tmp = [];
	// Filter thermals that are within 200m radius
	for (var i=0; i < thermals.length; i++) {
	    for (var j=0; j < tmp.length; j++) {
		var size = thermals[i].endpoint.alt - thermals[i].stpoint.alt;
		if (thermals[i].strength < min_strength && size < slow_up)
		    break;
		if (size < min_gain) 
		    break;

		if (thermals[i].stpoint.distance(tmp[j].stpoint) < undup_distance) {
		    tmp[j].count++;
		    break;
		}
	    }
	    if (j == tmp.length) {
		thermals[i].count = 1;
		tmp.push(thermals[i]);
	    }
	}
	return tmp;
    },

    pointKmlThermals : function(thermals, visible) {
	var folder = this.doc.createElement('Folder');
	this.txtel(folder, 'name', 'Thermal points');
	this.txtel(folder, 'visibility', '0');

	for (var i=0; i < thermals.length; i++) {
	    var date = new Date(thermals[i].stpoint.time);
	    var name = sprintf('%02d:%02d %.1fm/s +%dm (%d)', date.getUTCHours(), date.getUTCMinutes(),
			       thermals[i].strength, thermals[i].endpoint.alt - thermals[i].stpoint.alt, thermals[i].count);
		
	    var point = this.createKmlPoint(name, 'http://maps.google.com/mapfiles/kml/pal3/icon58.png', 
					    thermals[i].stpoint);

	    this.txtel(point, 'visibility', '0');
	    folder.appendChild(point);
	}

	return folder;
    },

    createKmlDOM : function() {
	var root = this.doc.createElementNS(this.kmlns, 'kml');
	this.doc.appendChild(root);
	// We have to declare somehow the namespace, seems to be bug in mozilla
	root.setAttributeNS('http://www.google.com/kml/ext/2.2', 'avoid', 'mozilla_bug_in_serializing_namespaces');

	if (this.tracklogs.length == 1) {
            var folder = root;
        } else {
            var folder = this.newel(root, 'Folder');
            this.txtel(folder, 'name', 'GiPSy flights');
            this.txtel(folder, 'open', '1');
        }

        var thermals = [];
        for (var i=0; i < this.tracklogs.length; i++) {
            var flight = this.createKmlFolder(this.tracklogs[i].tracklog, this.tracklogs[i].dinfo, i)
            folder.appendChild(flight);

            if (this.tracklogs[i].optinfo)
                flight.appendChild(this.optinfoKml(this.tracklogs[i].optinfo));
            thermals = thermals.concat(this.detectThermals(this.tracklogs[i].tracklog));
        }
        thermals = this.filterThermals(thermals);
        if (thermals) {
            var tpoints = this.pointKmlThermals(thermals);
            if (folder == root)
                flight.appendChild(tpoints);
            else
                folder.appendChild(tpoints);
        }
    },

    // Svg export
    svgWidth : 285,
    svgHeight : 200,
    svgTile : 64,

    svgGoogleZoom : function(pscale) {
	// Compute optimal zoom
	var zoom = 16;
	while (zoom > 0) {
	    // Compute tile width/height in pixels with given bounds & zoom level
	    var maxtile = Math.pow(2, (17-zoom));
	    var dimension = 2*Math.PI / maxtile;
	  
	    var prwidth = dimension * pscale;
	    if (prwidth <= this.svgTile + 0.01) // Floating point :-/
		break;
	    zoom--;
	}
	return zoom;
    },

    svgMakeBounds : function(scale, midlat, midlon, height, width) {
	var rad = height / scale;
	var minlat = midlat - rad/2;
	var maxlat = midlat + rad/2;
	
	var rad = width / scale;
	var minlon = midlon - rad/2;
	var maxlon = midlon + rad/2;
	
	// reproject backwards on sphere
	return {
	    projminlon : minlon,
	    projmaxlon : maxlon,
	    projminlat : minlat,
	    projmaxlat : maxlat,
	    midlon : midlon,
	    midlat : midlat,
	    scale : scale
	  };
    },

    computeSvgBounds : function(tlog, width, height) {
	  /* Compute the bounds so that the tracklog is perfectly
	     centered */

	  var minlon = tlog.svgProjectLon(tlog.igcGetStat(tlog.STAT_LON_MIN));
	  var maxlon = tlog.svgProjectLon(tlog.igcGetStat(tlog.STAT_LON_MAX));
	  var minlat = tlog.svgProjectLat(tlog.igcGetStat(tlog.STAT_LAT_MIN));
	  var maxlat = tlog.svgProjectLat(tlog.igcGetStat(tlog.STAT_LAT_MAX));

	  var midlon = (maxlon + minlon) / 2;
	  var midlat = (maxlat + minlat) / 2;
	
	  var xscale = width / (maxlon - minlon);
	  var yscale = height / (maxlat - minlat);

	  if (xscale < yscale)
	    var scale = xscale;
	  else
	    var scale = yscale;
	  // Update scale to be a nice value for googlemaps
	  var zoom = this.svgGoogleZoom(scale);
	  var dimension = 2*Math.PI / Math.pow(2, (17-zoom));
	  dimension *= 2; // Choose larger zoom level
	  scale = this.svgTile / dimension;

	  var bounds = this.svgMakeBounds(scale, midlat, midlon, height, width);

	  return bounds;
    },

    svgMapElement : function(x, y, width, height, link) {
	const xlinkns = 'http://www.w3.org/1999/xlink';

	var img = this.doc.createElement('image');
	img.setAttribute('x', x);
	img.setAttribute('y', y);
	img.setAttribute('width', width);
	img.setAttribute('height', height);
	img.setAttributeNS(xlinkns, 'href', link);
	
	return img;
    },

    svgGoogleMap : function(bounds, width, height) {
	var g = this.doc.createElement('g');

	var pscale = bounds.scale;
	var zoom = this.svgGoogleZoom(pscale);
	var dimension = 2*Math.PI / Math.pow(2, (17-zoom));
	var prwidth = Math.floor(dimension * pscale);

	var xtile = Math.floor((bounds.projminlon + Math.PI) / dimension);
	var xstart = (xtile * dimension - (bounds.projminlon + Math.PI)) * pscale;
	while (xstart < width) {
	    var replat = -bounds.projmaxlat;
	    var ytile = Math.floor((replat + Math.PI) / dimension);
	    var ystart = (ytile * dimension - (replat + Math.PI)) * pscale;
	    
	    while (ystart < height) {
		var svr = 'mt' + Math.floor(Math.random() * 4);
		var link = 'http://' + svr + '.google.com/' + get_string_pref('map_terrain');
		link += '&x=' + xtile + '&y=' + ytile + '&zoom=' + zoom;
		var img = this.svgMapElement(Math.floor(xstart), Math.floor(ystart),
					     prwidth, prwidth, link);
		g.appendChild(img);
		
		ystart += prwidth;
		ytile++;
	    }
	    xstart += prwidth;
	    xtile++;
	}
	return g;
    },
    
    createSvgMap : function(tlog, width, height) {
	var g = this.doc.createElement('g');

	var bounds = this.computeSvgBounds(tlog, width, height);

	// Map
	var map = this.svgGoogleMap(bounds, width, height);
	g.appendChild(map);
	
	// Track
	var path = this.newel(g, 'path');
	path.setAttribute('stroke', 'orange');
	path.setAttribute('stroke-width', '0.4');
	path.setAttribute('fill', 'none');
	var adata = tlog.svgPathTrack(width, height, bounds.projminlat,
				      bounds.projminlon, bounds.projmaxlon,
				      false);
	path.setAttribute('d', adata);
	
	// Icons
	
	return g;
    },
    
    createSvgProfile : function(tlog, width, height) {
	const marker_interval = 1000;
	var g= this.doc.createElement('g');

	var maxheight = tlog.igcGetStat(tlog.STAT_HEIGHT_MAX);
	maxheight = (Math.floor(maxheight/500)+1) * 500;

	// Altitude profile
	var path = this.newel(g, 'path');
	path.setAttribute('stroke', 'orange');
	path.setAttribute('stroke-width', '0.2');
	path.setAttribute('fill', 'none');
	path.setAttribute('d', tlog.svgPathData(tlog.ALTITUDE, tlog.POLYLINE, 
						width, height, maxheight, false));

	// Altitude markers
	var marker = this.newel(g, 'path');
	marker.setAttribute('stroke-dasharray', '2,4');
	marker.setAttribute('stroke-width', '0.1');
	marker.setAttribute('stroke', 'gray');
	var scale = height / maxheight;
	var adata = '';
	for (var i = marker_interval; i <= maxheight; i+=marker_interval) {
	    adata += 'M 0 ' + (height-i*scale);
	    adata += 'L ' + width + ' ' + (height-i*scale);

	    var text = this.newel(g, 'text');
	    text.setAttribute('x', 0);
	    text.setAttribute('y', height-i*scale);
	    text.setAttribute('dominant-baseline', 'hanging');
	    text.setAttribute('font-size', '1mm');

	    var data = this.doc.createTextNode(i + 'm');
	    text.appendChild(data);
	}
	marker.setAttribute('d', adata);

	// Time markers
	const INTERVAL = 600000;
	const LABELMINUTES = 60;
	const SHORT = 1;
	const LONG = 2;

	var tpath = this.newel(g, 'path');
	tpath.setAttribute('stroke', 'black');
	tpath.setAttribute('stroke-width', '0.2');
	var btime = tlog.igcPoint(0).time;
	var endtime = tlog.igcPoint(tlog.igcPointCount() - 1).time;
	var scale = (1.0 * width) / (endtime - btime);

	var labelminutes = LABELMINUTES;
	if (endtime - btime <= 30*60*1000)
	    labelminutes = 10;
	else if (endtime - btime <= 60*60*1000)
	    labelminutes = 20;
	else if (endtime - btime <= 150*60*1000)
	    labelminutes = 30;

	// Round time, so that there are not too many lines
	var interval = INTERVAL;

	var date = new Date(btime);
	date.setUTCMinutes(0);
	date.setUTCSeconds(0);
	date.setUTCMilliseconds(0);
	date.setUTCHours(date.getUTCHours() + 1);
	var time = date.valueOf();
	while (time-interval > btime)
	    time -= interval;

	adata = '';
	for (; time < endtime; time += interval) {
	    var x = (time - btime) * scale;
	    var mydate = new Date(time);
	    adata += 'M ' + x + ' ' + height;
	    if (mydate.getUTCMinutes() == 0)
		var y = height - LONG;
	    else
		var y = height - SHORT;
	    adata += 'L ' + x + ' ' + y;

	    if ((mydate.getUTCMinutes() % labelminutes) == 0) {
		var text = this.newel(g, 'text');
		text.setAttribute('x', x + 1);
		text.setAttribute('y', height - SHORT - 1);
		text.setAttribute('font-size', '1mm');
		text.setAttribute('fill', 'black');
		
		var date = new Date(time);
		var data = this.doc.createTextNode(sprintf('%d:%02d', date.getUTCHours(), date.getUTCMinutes()));
		text.appendChild(data);
	    }

	}
	tpath.setAttribute('d', adata);

	var tline = this.newel(g, 'line');
	tline.setAttribute('x1', '0');
	tline.setAttribute('x2', width);
	tline.setAttribute('y1', height);
	tline.setAttribute('y2', height);
	tline.setAttribute('stroke', 'black');
	tline.setAttribute('stroke-width', '0.2');

	return g;
    },

    createSvgDOM : function() {
	var tlog = this.tracklogs[0].tracklog;

	const svgns = "http://www.w3.org/2000/svg";
        const xlinkns = "http://www.w3.org/1999/xlink";

	var svg = this.doc.createElementNS(svgns, 'svg');
	this.doc.appendChild(svg);
	
	svg.setAttribute('width', this.svgWidth + 'mm');
	svg.setAttribute('height', this.svgHeight + 'mm');
	svg.setAttribute('viewBox', '0 0 ' + this.svgWidth + ' ' + this.svgHeight);

	// Background rectangle
	var rect = this.newel(svg, 'rect');
	rect.setAttribute('x', 0);
	rect.setAttribute('y', 0);
	rect.setAttribute('width', this.svgWidth);
	rect.setAttribute('height', this.svgHeight);
	rect.setAttribute('fill', 'white');

	// Draw altitude profile
	var profile = this.createSvgProfile(tlog, this.svgWidth-2, 50);
	svg.appendChild(profile);
	profile.setAttribute('transform', 'translate(1,140)');
	
	// Draw tracklog
	var clip = this.newel(svg, 'clipPath');
	clip.setAttribute('id', 'mapclip');
	var rect = this.newel(clip, 'rect');
	rect.setAttribute('x', 0);
	rect.setAttribute('y', 0);
	rect.setAttribute('width', this.svgWidth - 2);
	rect.setAttribute('height', this.svgHeight - 65);

	var map = this.createSvgMap(tlog, this.svgWidth - 2, this.svgHeight - 60);
	svg.appendChild(map);
	map.setAttribute('transform', 'translate(1,1)');
	map.setAttribute('clip-path', 'url(#mapclip)');
    },

    // Generic functions 

    newel : function(parent, elname, ns) {
        if (ns)
            var elem = this.doc.createElementNS(ns, elname);
        else
            var elem = this.doc.createElement(elname);
	parent.appendChild(elem);

	return elem;
    },
    
    txtel : function(parent, elname, text, ns) {
        var el = this.newel(parent, elname, ns);
	el.appendChild(this.doc.createTextNode(text));
    },

    addTracklog : function(tlog, dinfo, opt) {
	this.tracklogs.push({ tracklog: tlog, dinfo : dinfo, optinfo : opt });
    },

    saveAs : function(file, format, dtype) {
	this.doc = Components.classes["@mozilla.org/xml/xml-document;1"].createInstance(Components.interfaces.nsIDOMDocument);

	if (format == 'gpx')
	    this.createGpxDOM(dtype);
	else if (format == 'kml')
	    this.createKmlDOM(dtype);
	else if (format == 'svg')
	    this.createSvgDOM(dtype);
	else if (format == 'html')
	    this.createHtmlDOM(dtype);

	var serializer = Components.classes["@mozilla.org/xmlextras/xmlserializer;1"].getService(Components.interfaces.nsIDOMSerializer);

	var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"].createInstance(Components.interfaces.nsIFileOutputStream);

	// Write, create, truncate
	foStream.init(file, 0x2 | 0x8 | 0x20, 0664, 0); 

	var xmlhead = '<?xml version="1.0" encoding="UTF-8" ?>\n';
	foStream.write(xmlhead, xmlhead.length);

	var prettyOutput = XML(serializer.serializeToString(this.doc)).toXMLString();
	// Somehow we have to convert it from binary to unicode and then write it to file
	prettyOutput = cvt.ConvertFromUnicode(prettyOutput);
	foStream.write(prettyOutput, prettyOutput.length);
	
	foStream.close();
    },
    
    // for nsISupports
    QueryInterface: function(aIID) {
	// add any other interfaces you support here
	if (!aIID.equals(nsISupports))
	    throw Components.results.NS_ERROR_NO_INTERFACE;
	return this;
    }
}

//=================================================
// Note: You probably don't want to edit anything
// below this unless you know what you're doing.
//
// Factory
var GPSGpxFactory = {
  createInstance: function (aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    return (new GPSGpx()).QueryInterface(aIID);
  }
};

// Module
var GPSGpxModule = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType)
  {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(CLASS_ID, CLASS_NAME, CONTRACT_ID, aFileSpec, aLocation, aType);
  },

  unregisterSelf: function(aCompMgr, aLocation, aType)
  {
    aCompMgr = aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(CLASS_ID, aLocation);        
  },
  
  getClassObject: function(aCompMgr, aCID, aIID)
  {
    if (!aIID.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    if (aCID.equals(CLASS_ID))
      return GPSGpxFactory;

    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(aCompMgr) { return true; }
};

//module initialization
function NSGetModule(aCompMgr, aFileSpec) { return GPSGpxModule; }
