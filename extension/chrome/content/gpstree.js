/* Functions regarding the GPS devices tree */

var gps_observer = {
    observe : function(subject, topic, data) {
	subject = subject.QueryInterface(Components.interfaces.IGPSDevInfo);
	if (topic == "gps_changed") {
	    gpsView.update_gps(subject);
	    gpsStatusbar.update_gps(subject);
	} else if (topic == "gps_removed") {
	    gpsView.remove_gps(subject.pos);
	    gpsStatusbar.remove_gps(subject.pos);
	} 
    }
}

function init_gpstree() {
    observerService.addObserver(gps_observer, "gps_changed", false);
    observerService.addObserver(gps_observer, "gps_removed", false);

    gpsView.init();
    elem('gps_tree').view = gpsView;

    gpsStatusbar.init();

    scanner.startScanner();
}

function unload_gpstree() {
    scanner.stopScanner();
    observerService.removeObserver(gps_observer, "gps_changed");
    observerService.removeObserver(gps_observer, "gps_removed");
}

const GPS_TYPES = [ "Garmin", "Aircotec", "50x0/Compe*", "MLR/Digifly", "Flymaster" ];

// Show context menu for selecting gps type
function gps_tree_clicked(event) {
    var tree = document.getElementById("gps_tree");
    var tbo = tree.treeBoxObject;

    // get the row, col and child element at the point
    var row = { }, col = { }, child = { };
    tbo.getCellAt(event.clientX, event.clientY, row, col, child);
    col = col.value;
    row = row.value;
    if (col.id == 'gps_type') {
        var popup = document.getElementById('gps_popup');
        var x = event.clientX - tree.boxObject.x;
        var y = event.clientY - tree.boxObject.y;
        popup.openPopup(tree, 'overlap', x + 3, y + 3, true, false);
    }
}

var gpsView = {
    setTree: function(treebox){ this.treebox = treebox; },
    treebox : null,

    rows : [],
    pos2row : {},
    get rowCount() { return this.rows.length; },

    getCellText : function(row,column) {
	var gps = this.rows[row];
	
	if (column.id == 'gps_dev')
	    return gps.devname;
	else if (column.id == 'gps_type')
	    return GPS_TYPES[gps.gpstype];
	else if (column.id == 'gps_name') {
	    if (gps.last_error)
		return gps.gpsname + ': ' + gps.last_error;
	    return gps.gpsname;
	} else if (column.id == 'gps_progress') {
	    if (gps.wstatus == gps.W_DOWNCOMPLETE)
		return _('transfer.complete')
	    else if (gps.scan_enabled && gps.wstatus == gps.W_DISCONNECT)
		return _('scanning');
	    else if (gps.wstatus == gps.W_CONNECTED)
		return _('transfer.pushbutt');
	    else if (gps.wstatus == gps.W_DOWNLOADING)
		return _('data.waiting');
	    else
		return '';
	}
	return null;
    },

    getCellValue : function(row, col) {
	var gps = this.rows[row];

	if (col.id == 'gps_enabled')
	    return gps.scan_enabled;

	if (col.id == 'gps_progress')
	    return gps.progress;

	return null;
    },

    getProgressMode : function(row, col) {
	var gps = this.rows[row];
	if (gps.wstatus == gps.W_DOWNLOADING && gps.progress > 0)
	    return 1;
	return 3; // Text mode
    },

    isEditable : function(row, col) {
	if (col.id == 'gps_enabled')
	    return true;
	return false;
    },

    setCellValue : function(row, col, value) {
	if (col.id == 'gps_enabled') {
	    scanner.gpsToggle(this.rows[row].pos, value == 'true');
	}
    },

    hasNextSibling: function(row, afterIndex) {
	return false;
    },
    getParentIndex:function(row) {
	return -1;
    },
    isContainer: function(row) {return false;},
    isContainerEmpty: function(row) {return false;},
    isContainerOpen: function(row) {return false;},
    
    isSeparator: function(row) {return false;},
    isSorted: function(){ return false; },
    getLevel: function(row) {return 0;},

    getImageSrc: function(row,col){ return null; },
    getRowProperties: function(row,props) {},
    getCellProperties: function(row, col, props) {
        if (col.id == 'gps_enabled' || col.id == 'gps_type') {
            aserv = Components.classes["@mozilla.org/atom-service;1"]
                        .createInstance(Components.interfaces.nsIAtomService);
            props.AppendElement(aserv.getAtom(col.id));
        }
    },
    getColumnProperties: function(colid,col,props){},

    init : function() {
	var gpsarr = scanner.getGpsArray({});
	
	for (var i=0; i < gpsarr.length; i++)
	    this.update_gps(scanner.getGpsInfo(gpsarr[i]));
    },

    update_gps : function(gpsinfo) {
	var row = this.pos2row[gpsinfo.pos];
	
	if (row == null) {
	    this.rows.push(gpsinfo);
	    if (this.treebox)
		this.treebox.rowCountChanged(this.rowCount - 1, 1);
	    this.pos2row[gpsinfo.pos] = this.rows.length - 1;
	} else {
	    this.rows[row] = gpsinfo;
	    if (this.treebox)
		this.treebox.invalidateRow(row);
	}
    },

    remove_gps : function(pos) {
	var row = this.pos2row[pos];
	this.rows.splice(row, 1);
	this.treebox.rowCountChanged(row, -1);
	delete this.pos2row[pos];

	/* Decrement pos2row items */
	for (var ipos in this.pos2row) {
	    if (this.pos2row[ipos] > row)
		this.pos2row[ipos] = this.pos2row[ipos] - 1;
	}
    },

    set_gps_type : function(gpsname) {
	var row = elem('gps_tree').currentIndex;
	var gps = this.rows[row];
	if (gps) {
	    if (gpsname == 'garmin')
		var gtype = gps.G_GARMIN;
	    else if (gpsname == 'aircotec')
		var gtype = gps.G_AIRCOTEC;
	    else if (gpsname == 'compeo')
		var gtype = gps.G_COMPEO;
	    else if (gpsname == 'mlr')
		var gtype = gps.G_MLR;
            else if (gpsname == 'flymaster')
                var gtype = gps.G_FLYMASTER;
	    scanner.gpsChangeType(gps.pos, gtype);
	}
    }
};

var gpsStatusbar = {
    subpanels : {},
    
    update_gps : function(gps) {
	var panel = this.subpanels[gps.pos];
	
	// If we have empty name, ignore the GPS
	if (gps.wstatus == gps.W_DISCONNECT ||
	    (gps.gpstype == gps.G_AIRCOTEC && gps.wstatus == gps.W_DOWNLOADING) && !gps.gpsname) {
	    if (panel) {
		elem('statusbar').removeChild(panel);
		this.subpanels[gps.pos] = null;
	    }
	    return;
	}
	
	if (!panel) {
	    var panel = document.createElement('statusbarpanel');
	    var label = document.createElement('label');
	    panel.appendChild(label);

	    elem('statusbar').appendChild(panel);
	    this.subpanels[gps.pos] = panel;
	} else 
	    var label = panel.childNodes[0];

	// Set GPS name
	var newname = gps.gpsname;
	if (!newname && gps.gpstype == gps.G_AIRCOTEC)
	    newname = 'Aircotec';
	if (label.getAttribute('value') != newname)
	    label.setAttribute('value', newname);

	if (gps.wstatus == gps.W_CONNECTED || gps.wstatus == gps.W_DOWNCOMPLETE){
	    var but = panel.childNodes[1];
	    if (but == null || but.nodeName != 'button') {
		if (but) panel.removeChild(but);
		but = document.createElement('button');
		panel.appendChild(but);
	    }
	    if (gps.wstatus == gps.W_DOWNCOMPLETE) {
		but.setAttribute('label', _('tracklog.process'));
		but.setAttribute('oncommand', 'reprocess_gps(' + gps.pos + ')');
	    } else {
		but.setAttribute('label', _('transfer.start'));
		but.setAttribute('oncommand', 'start_download(' + gps.pos + ')');
	    }
	} else {
	    var prog = panel.childNodes[1];
	    if (prog == null || prog.nodeName != 'progressmeter') {
		if (prog) panel.removeChild(prog);
		prog = document.createElement('progressmeter');
		panel.appendChild(prog);
		prog.setAttribute('mode', 'determined');
	    }
	    prog.setAttribute('value', gps.progress);
	}
    }, 

    remove_gps : function(pos) {
	var panel = this.subpanels[pos];
	elem('statusbar').removeChild(panel);
	this.subpanels[pos] = null;
    },

    init : function() {
	var gpsarr = scanner.getGpsArray({});
	
	for (var i=0; i < gpsarr.length; i++)
	    this.update_gps(scanner.getGpsInfo(gpsarr[i]));
    }

};
