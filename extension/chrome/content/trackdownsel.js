var gps;

function fmtdate(date) {
    return sprintf("%d.%d.%d %02d:%02d:%02d", date.getUTCDate(),
                               date.getUTCMonth() + 1, date.getUTCFullYear(), 
                               date.getUTCHours(), date.getUTCMinutes(),
                               date.getUTCSeconds());
}

function fmttime(date) {
    return sprintf("%02d:%02d:%02d", date.getUTCHours(), date.getUTCMinutes(),
                               date.getUTCSeconds());
}

function OnLoad() {
    gps = window.arguments[0];
    
    // Fill out GPS name
    elem('w_gpsname').value = gps.gpsname;

    var dlist = elem('main_list');
    for (var i=0; i < gps.trackcount; i++) {
        var startdate = new Date(gps.trackStartTime(i));
        var enddate = new Date(gps.trackStopTime(i));
        
        var item = document.createElement('listitem');
        item.setAttribute('value', i);
        
        var cell1 = document.createElement('listcell');
        cell1.setAttribute('label', fmtdate(startdate) + ' - ' + fmttime(enddate));
        
        item.appendChild(cell1);
        dlist.appendChild(item);
    }
}
window.onload = OnLoad;


function download_tracklog() {
    var dlist = elem('main_list');
    if (!dlist.selectedCount)
        return;
    for (var i=0; i < dlist.selectedItems.length; i++) {
        var idx = dlist.selectedItems[i].value;
        gps.trackAdd(idx);
    }
    var scanner = Components.classes["@pgweb.cz/Gipsy/GPSsight;1"].getService(Components.interfaces.IGPSScanner);
    scanner.gpsDownload(gps.pos);
    window.close();
}
