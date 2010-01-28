var gstore  = Components.classes["@pgweb.cz/Gipsy/GPSstore;1"].getService().wrappedJSObject;

var fname;

function OnLoad() {
    fname = window.arguments[0];
    var dinfo = gstore.getFlightFile(fname);
    
    // Fill out country list on the flight info wizard
    var clist = document.getElementById('country');
    if (!dinfo['country'])
	clist.appendItem('--', '');
    for (var sc in Country_list) {
	clist.appendItem(Country_list[sc], sc);
    }

    // Fill out input data
    var fields = ['site', 'landing', 'xcontestid', 'pilot'];
    for (var i=0; i < fields.length; i++) {
	elem(fields[i]).value = dinfo[fields[i]];
    }
    elem('biplace').checked = dinfo['biplace'];
    elem('glider').inputField.value = dinfo['glider'];
    elem('synchro').selectedIndex = dinfo['synchro'];
    // Select country
    if (Country_list.hasOwnProperty(dinfo['country'])) {
	var i = 0;
	for (var country in Country_list) {
	    if (country == dinfo['country']) {
		clist.selectedIndex = i;
		break;
	    }
	    i++;
	}
    } else
	country.selectedIndex = 0;
    

    update_synchro();
}
window.onload = OnLoad;

var glider_filled = false;

function fill_gliders() {
    if (glider_filled)
	return;
    // Fill out gliders
    var glist = elem('glider');
    for (var i=0; i < glider_list.length; i++)
	glist.appendItem(glider_list[i], '');
    glider_filled = true;
}

function update_synchro() {
    var okbut = elem('properties-window').getButton('accept');
    if (elem('synchro').selectedIndex == 0) {
	elem('xcontestid').disabled = true;
	okbut.disabled = false;
    } else {
	elem('xcontestid').disabled = false;
	if (elem('xcontestid').value)
	    okbut.disabled = false;
	else
	    okbut.disabled = true;
    }
}


function save_changes() {
    var dinfo = {};
    var fields = ['site', 'landing', 'xcontestid', 'pilot', 'country'];
    
    for (var i=0; i < fields.length; i++)
	dinfo[fields[i]] = elem(fields[i]).value;
    dinfo['glider'] = elem('glider').inputField.value;
    dinfo['biplace'] = elem('biplace').checked ? 1 : 0;
    dinfo['synchro'] = elem('synchro').selectedIndex;
    
    gstore.updateIgcInfo(fname, dinfo);
}

function reset() {
    var tlog = gstore.loadTracklog(fname);
    var fields = ['site', 'xcontestid', 'pilot', 'glider'];
    for (var i=0; i < fields.length; i++)
	elem(fields[i]).value = tlog.igcGetParam(fields[i]);

    elem('biplace').checked = tlog.igcGetParam('biplace') ? true : false;
    elem('synchro').selectedIndex = tlog.igcGetParam('xcontestid') ? 2 : 0;
    elem('landing').value = gstore.getLanding(tlog);
}
