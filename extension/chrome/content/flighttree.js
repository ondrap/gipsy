
var citydb = Components.classes["@pgweb.cz/Gipsy/GPSCities;1"].getService().wrappedJSObject;

// Initialize tree of flights
function init_flight_tree()
{
    treeView.init();
    elem('flight_tree').view = treeView;
}

// TreeView for flights
var treeView = {
    setTree: function(treebox){ this.treebox = treebox; },
    primaryType : 'date',
    treebox : null,
    pilot_filter : null,
    pilot_filter_names : null,

    rows : [],
    get rowCount() { return this.rows.length; },    

    getCellText : function(row,column) {
	return this.rows[row][column.id];
    },
    hasNextSibling: function(row, afterIndex) 
    {
	for (var i=afterIndex+1; i < this.rows.length; i++) {
	    if (this.rows[i].level < this.rows[row].level)
		return false;
	    if (this.rows[i].level == this.rows[row].level)
		return true;
	}
	return false
    },
    getParentIndex:function(row) 
    {
	if (this.rows[row].level == 0)
	    return -1;

	var mylevel = this.rows[row].level;

	for (; row >= 0; row--) {
	    if (this.rows[row].level == mylevel-1)
		return row;
	}
	return -1;
    },

    isContainer: function(row) 
    { 
	if (this.rows[row].level == 0 && !this.rows[row].separator)
	    return true; 
	if (this.rows[row].level == 1 && this.primaryType == 'site')
	    return true;
	return false;
    },
    isContainerEmpty: function(row) {return false;},
    isContainerOpen: function(row) 
    {
	if (row+1 >= this.rows.length)
	    return false;

	if (this.rows[row+1].level > this.rows[row].level)
	    return true;
	return false;
    },
    // Cycle primary sorting site vs. date
    cycleHeader: function(col) 
    {
	if (col.id == 'col_site' && this.primaryType != 'site') {
	    this.primaryType = 'site';
	    this.init();
	} else if (col.id == 'col_date' && this.primaryType != 'date') {
	    this.primaryType = 'date';
	    this.init();
	}
    }, 

    toggleOpenState: function(row) 
    {
	if (this.isContainerOpen(row)) {
	    var first = row + 1;
	    var mylevel = this.rows[row].level;
	    // Close all sub-containers on the way
	    for (var i=0; first + i < this.rows.length && this.rows[first+i].level == mylevel+1; i++)
		if (this.isContainer(first+i) && this.isContainerOpen(first+i))
		    this.toggleOpenState(first+i);
	    this.rows.splice(first, i);
	    this.treebox.rowCountChanged(first, -i);
	} else if (this.primaryType == 'site' && this.rows[row].level == 0) {
	    var sites = gstore.getDistinctSites(this.rows[row].value, 
						this.pilot_filter);
	    for (var i=0; i < sites.length; i++)
		this.rows.splice(row+i+1, 0, {
		    level : 1,
		    col_date_nm : sites[i][0],
		    count : sites[i][1],
		    separator : false,
		    value : [this.rows[row].value, sites[i][0] ],
		    get col_date() { 
			return this.col_date_nm + ' (' + this.count + ')';
		    }

		});
	    this.treebox.rowCountChanged(row + 1, sites.length);
	} else {
	    if (this.primaryType == 'date') {
	        var newitems = gstore.getFlightsInMonth(this.rows[row].value,
							this.pilot_filter);
		var newlevel = 1;
	    } else {
	        var newitems = gstore.getFlightsOnSite(this.rows[row].value[0], this.rows[row].value[1],
						       this.pilot_filter);
		var newlevel = 2;
	    }
	    for (var i=0; i < newitems.length; i++) {
		var date = new Date(newitems[i].date);
		date = sprintf("%d.%d.%d %02d:%02d", date.getUTCDate(),
			       date.getUTCMonth()+1, date.getUTCFullYear(), 
			       date.getUTCHours(), date.getUTCMinutes(),
			       date.getUTCSeconds());
		var site = newitems[i].site;
		if (newitems[i].country != '--')
		    site += ' (' + newitems[i].country + ')';
		this.rows.splice(row+i+1, 0, {
		        level : newlevel,
			col_date : date,
			col_site : site,
		        col_glider : newitems[i].glider,
		        col_pilot : newitems[i].pilot,
			col_landing : newitems[i].landing,
			col_fname : newitems[i].file,
			synchro : newitems[i].synchro,
			value : newitems[i].file,
			separator : false,
			flight : true
		});
	    }
	    this.treebox.rowCountChanged(row + 1, newitems.length);
	}
    } ,

    isSeparator: function(row) { 
	return this.rows[row].separator; 
    },
    isSorted: function(){ return false; },

    getLevel: function(row)
    { 
	return this.rows[row].level;
    },

    getImageSrc: function(row,col){ return null; },

    getRowProperties: function(row,props) {
	if (this.rows[row].synchro == gstore.SYNCHRO_ENABLED) {
	    var aserv = Components.classes["@mozilla.org/atom-service;1"]
	            .createInstance(Components.interfaces.nsIAtomService);
	    props.AppendElement(aserv.getAtom('scheduled'));
	}
    },
    getCellProperties: function(row,col,props){},
    getColumnProperties: function(colid,col,props){},

    init : function() {
	collapsed = true;
	// Initialize pilot_filter
	var pfilter = elem('pilot_filter');
	if (this.pilot_filter_names == null) {
	    this.pilot_filter_names = [];
	}
	// Add pilots that were not added yet
	var pilots = gstore.getDistinctPilots();
	var selpilot = gstore.get_config('ufilter');
	if (!selpilot)
	    selpilot = null;
	for (var i=0; i < pilots.length; i++) {
	    if (this.pilot_filter_names.indexOf(pilots[i]) != -1)
		continue;
	    this.pilot_filter_names.push(pilots[i]);
	    pfilter.appendItem(pilots[i], pilots[i]);
	    if (selpilot == pilots[i]) {
		this.pilot_filter = selpilot;
		// Select index
		pfilter.selectedIndex = i + 1;
	    }
	}

	var oldcount = this.rowCount;
	if (this.primaryType == 'site')
	    this.initSite();
	else
	    this.initDate();

	if (this.treebox != null) {
	    this.treebox.rowCountChanged(0, -oldcount);
	    this.treebox.rowCountChanged(0, this.rowCount);
	}
    },

    // Initialize tree for displaying sorted on site
    initSite: function() {
	var cntrs = gstore.getDistinctCountries(this.pilot_filter);
	this.primaryType = 'site';
	
	this.rows = [];
	for (var i=0; i < cntrs.length; i++) {
	    var country = cntrs[i][0];
	    if (Country_list.hasOwnProperty(country))
		country = Country_list[country];
	    this.rows.push({
                    synchro : false,
		    level : 0,
		    col_date_nm : country,
		    count : cntrs[i][1],
		    value : cntrs[i][0],
		    separator: false,
		    get col_date() { 
			return this.col_date_nm + ' (' + this.count + ')';
		    }
		    });
	}
    } ,
    
    initDate : function() {
	// Initialize treeview
	var months = gstore.getDistinctMonths(this.pilot_filter);
	this.primaryType = 'date';
	
	var lastyear = null;
	
	this.rows = [];
	for (var i=0; i < months.length; i++) {
	    if (lastyear != null && months[i][1] != lastyear) {
		this.rows.push({
		        level : 0,
			separator : true,
			synchro : false
			});
	    } 
	    this.rows.push({
		    level : 0,
		    value : months[i][0],
		    col_date_nm : months[i][0],
		    count : months[i][2],
		    synchro : false,
		    separator: false,
		    get col_date() { 
			return this.col_date_nm + ' (' + this.count + ')';
		    }
		    });
	    lastyear = months[i][1];
	}
    },

    // Open properties window
    properties_cmd : function() {
	if (flightmodel.fname == null)
	    return;
	window.openDialog('chrome://gipsy/content/properties.xul', 'gipsy_properties', 
			  'dialog=yes,chrome,modal=yes', flightmodel.fname);
    },

    // Show source code
    show_file : function() {
	if (flightmodel.fname == null)
	    return;
	window.openDialog('chrome://gipsy/content/plaintext.xul', 
			  'gipsy_source',
			  'dialog=no,chrome,modal=no', flightmodel.fname);
    },

    // Launch file in system application
    launch_file : function() {
	if (flightmodel.fname == null)
	    return;
	var file = gstore.getIGCFile(flightmodel.fname);
	file.launch();
    },

    // Start user command
    user_command : function(num) {
        var flist = this.get_selected_fnames();
        for (var i=0; i < flist.length; i++)
            this.user_command_fname(num, flist[i]);
    },
    
    user_command_fname : function (num, fname) {
        var file = gstore.getIGCFile(fname);
        var process = Components.classes["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess);
        var procname = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
        procname.initWithPath(get_string_pref('usercmd_' + num + '_cmd'));
        try {
            process.init(procname);
        } catch (e) {
            alert('Cannot initialize - wrong path to user command?');
            throw e;
        }

        if (get_string_pref('usercmd_' + num + '_type') == 'hspoints') {
            var tmpfile = gstore.getIGCFile(fname + '.opt');
        } else {
            var dirsvc = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
            var tmpfile = dirsvc.get('TmpD', Components.interfaces.nsILocalFile);
            tmpfile.appendRelativePath('gipsy.output');
        }
        
        args = [ cvt.ConvertFromUnicode(file.path), cvt.ConvertFromUnicode(tmpfile.path) ];
        
        var params = get_string_pref('usercmd_' + num + '_params');
        params = params.split(' ');
        for (var i=0; i < params.length; i++)
            args.push(params[i]);
        
        process.run(true, args, args.length);

        if (process.exitValue) {
            alert('Process failed.');
        } else {
            if (get_string_pref('usercmd_' + num + '_type') == 'hspoints') {
                flightmodel.update_opts();
            } else
                window.openDialog('file:///' + tmpfile.path, 'user_output', 'dialog=yes, chrome, modal=yes');
        }
    },

    get_selected_fnames : function() {
        var flist = [];
        var rangeCount = this.treebox.view.selection.getRangeCount();
        for (var i=0; i < rangeCount; i++) {
            var start = {};
            var end = {};
            this.treebox.view.selection.getRangeAt(i,start,end);
            for(var c=start.value; c <= end.value; c++) {
                if (this.rows[c].flight)
                    flist.push(this.rows[c].value);
            }
        }
        
        return flist;
    },

    // Export selected file to GPX
    export_file : function(format, dtype) {
	var flist = this.get_selected_fnames();
	if (flist.length == 0)
	    return;

	var gpx = Components.classes["@pgweb.cz/Gipsy/GPSGpx;1"].createInstance().wrappedJSObject;
	for (var i=0; i < flist.length; i++) {
	    var tlog = gstore.loadTracklog(flist[i]);
	    var dinfo = gstore.getFlightFile(flist[i]);
            var opt = gstore.loadOptimization(flist[i] + '.opt');
	    gpx.addTracklog(tlog, dinfo, opt);
	}

	var nsIFilePicker = Components.interfaces.nsIFilePicker;
	var fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	fp.init(window, "Save As", nsIFilePicker.modeSave);
	
	fp.defaultExtension = '.' + format;
	if (flist.length == 1) {
	    var fpdir = flist[0].split('/');
	    var fname = fpdir[fpdir.length - 1];
	    fp.defaultString = fname.replace(/igc$/, format, 'i');
	} else
	    fp.defaultString = 'flights.' + format;

	var res = fp.show();
	if (res == fp.returnOK || res == fp.returnReplace) {
	    gpx.saveAs(fp.file, format, dtype);
	}
    },

    // Delete file command from context menu
    delete_cmd : function() {
	// Get all selected items
	var rowlist = [];
	var rangeCount = this.treebox.view.selection.getRangeCount();
	for (var i=0; i < rangeCount; i++) {
	    var start = {};
	    var end = {};
	    this.treebox.view.selection.getRangeAt(i,start,end);
	    for(var c=start.value; c <= end.value; c++)
		rowlist.push(c);
	}
	
	if (rowlist.length == 0)
	    return;
	
	if (rowlist.length == 1) {
	    if (!this.rows[rowlist[0]].flight)
		return;
	    var fname = this.rows[rowlist[0]].value;
	    var txt = elem('bundle').getFormattedString('delflight_one', [fname]);
	    if (!confirm(txt))
		return;
	} else 
	    if (!confirm(elem('bundle').getString('delflight_more')))
		return;

	rowlist.sort(function(a,b) { if (a > b) return -1; if (a < b) return 1; return 0; });
	for (var i=0; i < rowlist.length; i++) {
	    var row = rowlist[i];
	    if (!this.rows[row].flight)
		continue;
	    var fname = this.rows[row].value;
	    gstore.deleteFlightFile(fname);
	    try { gstore.deleteFlightFile(fname + '.opt');} catch (e) {}; // Catch removal
	    gstore.deleteFlightDb(fname);
	}
    },

    // Update IGC data selectively, by DB change
    // TODO: reinit tree if changed site & we are in site view
    update_igc : function(fname) {
	var dinfo = gstore.getFlightFile(fname);
	var fields = ['glider','pilot','landing'];
	for (var i=0; i < this.rows.length; i++) {
	    if (this.rows[i].flight && this.rows[i].value == fname) {
		for (var j=0; j < fields.length; j++)
		    this.rows[i]['col_' + fields[j]] = dinfo[fields[j]];

		var site = dinfo.site;
		if (dinfo.country != '--')
		    site += ' (' + dinfo.country + ')';
		this.rows[i]['col_site'] = site;
	    }
	}
	this.updateSync(fname);
    },

    // Remove IGC notification - remove selectively from list if displayed
    remove_igc : function(fname) {
	for (var i=0; i < this.rows.length; i++) {
	    if (this.rows[i].flight && this.rows[i].value == fname) {
		var nextlevel = this.rows[i].level - 1;
		this.rows.splice(i, 1);
		this.treebox.rowCountChanged(i, -1);
		// Go up the hierarchy
		for (i-=1; i >= 0; --i) {
		    if (this.rows[i].level == nextlevel) {
			this.rows[i].count--;
			if (this.rows[i].count > 0) {
			    this.treebox.invalidateRow(i);
			} else {
			    this.rows.splice(i, 1);
			    this.treebox.rowCountChanged(i, -1);
			}
			if (nextlevel-- == 0)
			    break;
		    }
		}
		break;
	    }
	}
	// TODO: update category status even on closed categories...
    },

    // Update synchronization state of a flight
    updateSync : function(fname) {
	for (var i=0; i < this.rows.length; i++) {
	    if (this.rows[i].flight && this.rows[i].value == fname) {
		dinfo = gstore.getFlightFile(fname);
		this.rows[i].synchro = dinfo.synchro;
		this.treebox.invalidateRow(i);
		break;
	    }
	}
    }    
};

var flightmodel = {
    _fname : null,

    /* Clean all labels in statistics tabs */
    stats_clean : function() {
	var fields = [ 'date', 'utc_date', 'site', 'landing', 'dist_startland',
		       'duration',
		       'height_max', 'height_diff', 'dist_flown', 'speed_max',
		       'vario_max', 'vario_min', 'height_upsum', 'pilot', 
		       'glider', 'xcontestid', 'synchro', 
		       'comment', 'gpsname', 'fname' ];
	for (var i=0; i < fields.length; i++)
	    elem('f_' + fields[i]).value = '';

	elem('xcontest_row').hidden = true;
	elem('f_synchro_upload').hidden = true;
    },
    
    get fname() { return this._fname; },

    set fname(fname) {
        if (fname)
            this.tlog = gstore.loadTracklog(fname);
        else 
            this.tlog = null;

        if (this.tlog == null) {
            this._fname = null;
            this.stats_clean();
            return;
        }
        this._fname = fname;
        
        this.update();
    },

    // Update screen according to the model
    update : function() {
        var dinfo = gstore.getFlightFile(this.fname);
        this.stats_update(dinfo);
        this.xcontest_update(dinfo);

        var flist = treeView.get_selected_fnames();
        if (flist.length == 0) 
            return;
        var tlist = [];
        if (flist.length == 1) { // Avoid unnecessary reparsing of the tracklog
        	tlist.push(this.tlog);
    	} else {
            for (var i=0; i < flist.length; i++)
                tlist.push(gstore.loadTracklog(flist[i]));
    	}
        // Limit display to 6 tracklogs
        tlist.splice(6);
        gmap.set_tracklogs(tlist);
        gprofile.set_tracklog(tlist[0]);
        this.update_opts();
    },
    
    update_opts : function() {
        var flist = treeView.get_selected_fnames();
        var optlist = [];
        for (var i=0; i < flist.length; i++) {
            var opt = gstore.loadOptimization(flist[i] + '.opt');
            if (opt)
                optlist.push(opt);
        }
        optlist.splice(6);
        gmap.set_optimizations(optlist);
    },

    xcontest_update : function(dinfo) {
	elem('f_synchro_upload').hidden = true;
	if (dinfo.synchro == gstore.SYNCHRO_NONE)
	    elem('f_synchro').value = '';
	else if (dinfo.synchro == gstore.SYNCHRO_ENABLED) {
	    elem('f_synchro').value = _('synchro_prep');
	    elem('f_synchro_upload').hidden = false;
	} else if (dinfo.synchro == gstore.SYNCHRO_DONE)
	    elem('f_synchro').value = _('synchro_uploaded');
	else
	    elem('f_synchro').value = '?';

	// Update Contests information
	// Clear menulist
	
	var contests = gstore.getContests(this.fname);
	if (! contests.length) 
	    elem('xcontest_row').hidden = true;
	else {
	    elem('xcontest_row').hidden = false;
	    var xlist = elem('xcontest_list');
	    xlist.removeAllItems();
	    for (var i=0; i < contests.length; i++)
		xlist.appendItem(contests[i].name, 
				 contests[i].url + dinfo.xcontestid + '/');
	    // Select first
	    xlist.selectedIndex = 0;
	}
    },
    
    /* Update statistics information */
    stats_update : function(dinfo) {
	var tlog = this.tlog;
    
	// Set stat label to a particular text
	var us = function(el, val) { 
	    var element = document.getElementById('f_' + el);
	    element.value = val;
	};
    
	us('pilot', tlog.igcGetParam('pilot'));
	var glider = tlog.igcGetParam('glider');
	if (dinfo.biplace)
	    glider += ' (biplace)';
	us('glider', glider);
	us('comment', tlog.igcGetParam('comment'));
	us('gpsname', tlog.igcGetParam('a_record'));
	us('landing', dinfo.landing);
	us('fname', this.fname);

	var site = dinfo.site;
	if (dinfo.country && Country_list.hasOwnProperty(dinfo.country))
	    site += ' (' + Country_list[dinfo.country] + ')';
	us('site', site);
	us('xcontestid', dinfo.xcontestid);

	us('date', new Date(dinfo.date * 1000).toLocaleString());
	us('utc_date', new Date(dinfo.date * 1000).toUTCString());
    
	us('dist_startland', format_km(tlog.igcGetStat(tlog.STAT_DIST_STARTLAND)));
	us('dist_flown', format_km(tlog.igcGetStat(tlog.STAT_DIST_FLOWN)));
	us('height_max', format_m(tlog.igcGetStat(tlog.STAT_HEIGHT_MAX)));
	us('speed_max', format_kmh(tlog.igcGetStat(tlog.STAT_SPEED_MAX)));
	us('height_diff', format_m(tlog.igcGetStat(tlog.STAT_HEIGHT_MAX) - tlog.igcGetStat(tlog.STAT_HEIGHT_MIN)));
	us('vario_max', format_ms(tlog.igcGetStat(tlog.STAT_VARIO_MAX)));
	us('vario_min', format_ms(tlog.igcGetStat(tlog.STAT_VARIO_MIN)));
	us('height_upsum', format_m(tlog.igcGetStat(tlog.STAT_HEIGHT_UPSUM)));


	var duration = tlog.igcPoint(tlog.igcPointCount()-1).time - tlog.igcPoint(0).time;
	duration = new Date(duration);
	us('duration', sprintf("%02d:%02d:%02d", duration.getUTCHours(), duration.getUTCMinutes(), duration.getUTCSeconds()));

    }


};

/* Collapse/expand complete tree */
var collapsed = true;
function expand_all()
{
    if (collapsed) {
	/* Expand all */
	for (var row=0; row < treeView.rowCount; row++) {
	    if (treeView.isContainer(row) && !treeView.isContainerOpen(row))
		treeView.toggleOpenState(row);
	}
    } else {
	/* Collapse all */
	for (var row=treeView.rowCount - 1; row >= 0; row--) 
	    if (treeView.isContainer(row) && treeView.isContainerOpen(row))
		treeView.toggleOpenState(row);
    }
    collapsed = !collapsed;
}

/* Try to start uploader for a given flight */
function start_upload() 
{
    var fname = flightmodel.fname;
    window.openDialog('chrome://gipsy/content/synchro.xul', 'gipsy_synchro', 'dialog=no,chrome,modal=no',
		      fname);
}

/* Handle flight selection in flight tree */
function tree_flight_select()
{
    var row = document.getElementById('flight_tree').currentIndex;
    if (row < 0 || row >= treeView.rows.length || ! treeView.rows[row].flight) {
		flightmodel.fname = null;
		return true;
    }
    flightmodel.fname = treeView.rows[row].value;

    return true;
}

function open_xcontest_browser()
{
    var xlist = document.getElementById('xcontest_list');
    var tlog = flightmodel.tlog;
    var date = new Date(tlog.igcPoint(0).time);
    var dturl = sprintf('%d.%d.%d/%02d:%02d', date.getUTCDate(), 
			date.getUTCMonth()+1, date.getUTCFullYear(), 
			date.getUTCHours(), date.getUTCMinutes());
    var url = xlist.selectedItem.value + dturl;
    window.open(url,"_blank");
}

// On pilot filter change
function pilot_filter_change() {
    var newpilot = elem('pilot_filter').selectedItem.value;
    if (newpilot == '')
	newpilot = null;
    if (newpilot == treeView.pilot_filter)
	return;

    treeView.pilot_filter = newpilot;
    treeView.init();
    // Save prefs
    gstore.add_config('ufilter', newpilot);
}
