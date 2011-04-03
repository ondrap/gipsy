var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;

var noncount;

function fill_sync_flights() {
    noncount = gstore.synchroFlights();

    var slist = elem('sync_list');
    
    // Clear from list all items
    for (var i=slist.childNodes.length-1; i >= 0; i--) {
	var node = slist.childNodes[i];
	if (node.nodeName == 'listitem')
	    slist.removeChild(node);
    }
    
    var selindex = 0;

    for (var i=0; i < noncount.length; i++) {
	var item = document.createElement('listitem');
	var cell1 = document.createElement('listcell');
	var cell2 = document.createElement('listcell');
	var cell3 = document.createElement('listcell');
	cell1.setAttribute('label', noncount[i]);

	var dinfo = gstore.getFlightFile(noncount[i]);

	var date = new Date(dinfo.date * 1000).toLocaleString();
	cell2.setAttribute('label', date);
	cell3.setAttribute('label', dinfo.site);

	item.setAttribute('value', noncount[i]);
	item.appendChild(cell1);
	item.appendChild(cell2);
	item.appendChild(cell3);
	slist.appendChild(item);

        if (window.arguments && noncount[i] == window.arguments[0])
	    selindex = i;
    }

    // We must wait for the binding to initialize and THEN select
    // the list item :-/
    window.setTimeout(function() { elem('sync_list').selectedIndex = selindex;}, 1);
}

function onsyncreq(fname) {
    if (fname == null) {
	var slist = elem('sync_list');

	if (slist.selectedCount == 0)
	    return false;
    
	fname = slist.selectedItem.value;
    }
    var tlog = gstore.loadTracklog(fname);

    flightclaim.fname = fname;
    flightclaim.tlog = tlog;
    flightclaim.dinfo = gstore.getFlightFile(fname);
    flightclaim.wizard = elem('gps-sync-window');

    flightclaim.dinfo.comment = tlog.igcGetParam('comment');
    flightclaim.dinfo.biplace = tlog.igcGetParam('biplace') == 'true';

    var cls = tlog.igcGetParam('faiclass');
    if (cls.substr(0,4) == 'FAI-')
	flightclaim.dinfo.faiclass = cls[4];

    return true;
}

function onsyncnext() {
    var pg = elem('browser_page');

    noncount = gstore.synchroFlights();
    if (noncount.length)
	pg.setAttribute('next', 'first_page');
    else
	pg.setAttribute('next', 'final_page');
}
