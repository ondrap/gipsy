// 'GoogleMaps'-like API

htmlns = "http://www.w3.org/1999/xhtml";

// Mapping object - give it an identifier of a div element and it will build a complete map
function TerrainMap(id) {
    var self = this;

    // What to show to the user as a distance scale
    this.distScales = [0.05, 0.1, 0.2, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 200, 500, 1000, 2000, 5000];
    
    this.main = document.getElementById(id);
    this.main.style.overflow = 'hidden';
    this.main.style.position = 'relative';

    // Add controls
    var zoomin = this.gen_img('zoomin.png', 12, 61);
    this.main.appendChild(zoomin);
    zoomin.addEventListener('click', function() { self.zoom_in(); }, false);
    var zoomout = this.gen_img('zoomout.png', 12, 79);
    this.main.appendChild(zoomout);
    zoomout.addEventListener('click', function() { self.zoom_out(); }, false);
    
    // Add scroll area
    this.dragarea = document.createElementNS(htmlns, 'div');
    this.dragarea.style.position = 'absolute';
    this.main.appendChild(this.dragarea);
    
    // Add scaling
    this.scalearea = document.createElementNS(htmlns, 'div');
    this.scalearea.style.position = 'absolute';
    this.scalearea.style.left = '10px';
    this.scalearea.style.bottom = '5px';
    this.scalearea.style.width = '130px';
    this.scalearea.style.height = '15px';
    this.scalearea.style.zIndex = '4000';
    this.main.appendChild(this.scalearea);
    
    this.scalecanvas = document.createElementNS(htmlns, 'canvas');
    this.scalecanvas.width = 130;
    this.scalecanvas.height = 15;
    this.scalecanvas.style.position = 'absolute';
    this.scalearea.appendChild(this.scalecanvas);
    
    this.scalelabel = document.createElementNS(htmlns, 'span');
    this.scalelabel.style.position = 'absolute';
    this.scalelabel.style.color = 'white';
    this.scalelabel.style.font = '9pt Arial';
    this.scalelabel.style.top = '5px';
    this.scalelabel.style.left = '10px';
    this.scalearea.appendChild(this.scalelabel);
    
    // Add map
    this.maparea = document.createElementNS(htmlns, 'div');
    this.dragarea.appendChild(this.maparea);
    // Choose some center of a map so that we could avoid huge x/y values
    this.centerx = 0;
    this.centery = 0;
    
    // Add tracklog
    this.tracklogarea = document.createElementNS(htmlns, 'div');
    this.dragarea.appendChild(this.tracklogarea);
    // Add optimization area
    this.optimarea = document.createElementNS(htmlns, 'div');
    this.dragarea.appendChild(this.optimarea);
    // Add optimization results area
    this.optresarea = document.createElementNS(htmlns, 'div');
    this.optresarea.style.position = 'absolute';
    this.optresarea.style.right = '0px';
    this.optresarea.style.paddingRight = '1px';
    this.optresarea.style.top = '0px';
    this.optresarea.style.background = 'white';
    this.optresarea.style.zIndex = 3000;
    this.optresarea.style.opacity = 0.6;
    this.optresarea.style.color = 'black';
    this.optresarea.style.font = '9pt Arial';
    this.main.appendChild(this.optresarea);
    
    this.glider_icon = this.make_icon('glider.png', 0, 0);

    this.dragging = false;
    this.x = 0;
    this.y = 0;
    this.zoom = 16;
    // Array to store loaded tiles
    this.loaded_tiles = new Array();
    this.tracklogs = [];
    this.degraded_tracklogs = false;
    this.optimizations = [];

    this.__defineGetter__('realx', function() { return this.x + this.centerx; });
    this.__defineSetter__('realx', function(newx) { this.x = newx - this.centerx; });
    this.__defineGetter__('realy', function() { return this.y + this.centery; });
    this.__defineSetter__('realy', function(newy) { this.y = newy - this.centery; });

    this.mousedown = function(evt) {
        if (evt.which == 1) {
            self.dragging = true;
            self.lastx = evt.clientX;
            self.lasty = evt.clientY;
        }
    }
    this.mouseup = function(evt) {
        if (self.dragging && evt.which == 1) {
            self.dragging = false;
            self.show_scale();
            if (self.degraded_tracklogs)
                self.reload_tracklogs();
        }
    }
    this.mousemove = function(evt) {
        if (!self.dragging)
            return;
        self.x += self.lastx - evt.clientX;
        self.y += self.lasty - evt.clientY;
        
        // Check map limits
        var xlimit = self.limit() - self.main.offsetWidth;
        var ylimit = self.limit() - self.main.offsetHeight;
        if (self.realx > xlimit)
            self.realx = xlimit;
        if (self.realy > ylimit)
            self.realy = ylimit;

        if (self.realx < 0)
            self.realx = 0;
        if (self.realy < 0)
            self.realy = 0;

        self.dragarea.style.left = (-self.x).toString() + 'px';
        self.dragarea.style.top = (-self.y).toString() + 'px';
        self.lastx = evt.clientX;
        self.lasty = evt.clientY;
        self.load_maps();
    }
    this.resize = function() {
        self.load_maps();
    }
    this.dblclick = function(evt) {
        // Move center to the place of the doubleclick
        var lx = evt.clientX - findPosX(self.main);
        var ly = evt.clientY - findPosY(self.main);
        self.x += lx - Math.floor(self.main.offsetWidth / 2);
        if (self.realx < 0)
            self.realx = 0;
        self.y += ly - Math.floor(self.main.offsetHeight / 2);
        if (self.realy < 0)
            self.realy = 0
        self.zoom_in();
    }
    this.lastrightclick = 0;
    this.rightclick = function(evt) {
        var ddate = new Date().valueOf();
        if (ddate - self.lastrightclick < 300)
            self.zoom_out();
        else
            self.lastrightclick = ddate;
    }
    this.main.addEventListener('contextmenu', this.rightclick, false);
    this.main.addEventListener('mousedown', this.mousedown, true);
    this.main.addEventListener('mousemove', this.mousemove, false);
    this.main.addEventListener('dblclick', this.dblclick, false);
    window.addEventListener('resize', this.resize, false);
    window.addEventListener('mouseup', this.mouseup, false);

    this.maplayers = [];
}

TerrainMap.prototype.show_scale = function() {
    // Set color of scalelabel
    if (!this.maplayers.length || this.maplayers[0] == 'map_googlemap')
        this.scalelabel.style.color = 'black';
    else
        this.scalelabel.style.color = 'white';
    
    var distance = this.distScales[this.zoom + 1];
    var angle = 360 * (distance / (6378 * 2 * Math.PI));
    // Detect latitude, make it larger
    var lat = this.projecty(this.y + this.main.offsetHeight / 2);
    angle = angle / Math.cos(2 * Math.PI * (lat / 360.0));
    var width = this.projectlon(angle) - this.projectlon(0);
    
    empty(this.scalelabel);
    this.scalelabel.appendChild(document.createTextNode(format_km0(distance * 1000)));
    
    ctx = this.scalecanvas.getContext('2d');

    ctx.save();
    ctx.translate(1.5, 1.5);
    ctx.clearRect(0, 0, this.scalecanvas.width, this.scalecanvas.height);
    ctx.strokeStyle = 'white';
    ctx.strokeRect(0, 0, width, this.scalecanvas.height);
    ctx.fillStyle = 'black';
    ctx.fillRect(1, 1, width - 2, this.scalecanvas.height);
    ctx.strokeRect(3, 3, width - 6, this.scalecanvas.height - 2);
    ctx.clearRect(4, 4, width  - 8, this.scalecanvas.height);
    ctx.restore();
}

// Put a glider_icon on a given position
TerrainMap.prototype.mark_position = function(lat, lon) {
    var x = this.projectlon(lon);
    var y = this.projectlat(lat);
    this.glider_icon.style.left = x + 'px';
    this.glider_icon.style.top = y + 'px';
    if (this.glider_icon.parentNode == null)
        this.tracklogarea.appendChild(this.glider_icon);
}

// Set map layers
// (list of strings)
TerrainMap.prototype.set_layers = function(layers) {
    this.maplayers = layers;
    this.clean_map();
    this.load_maps();
    this.show_scale();
}

// Generate an image of control button
TerrainMap.prototype.gen_img = function(png, x, y) {
    var zoomin = document.createElementNS(htmlns, 'img');
    zoomin.setAttribute('src', png);
    zoomin.style.position = 'absolute';
    zoomin.style.zIndex = '2000';
    zoomin.style.top = y + 'px';
    zoomin.style.left = x + 'px';
    zoomin.style.cursor = 'pointer';
    return zoomin;
}

// Project longitude into X-coordinates starting at X=0 when LON=-180
TerrainMap.prototype.projectlon = function(lon) {
    var scale = this.limit() / 360;
    return Math.round((lon + 180) * scale) - this.centerx;
}

// Project latitude into Y-coordinates starting at Y=0 when LAT=-90
TerrainMap.prototype.projectlat = function(lat) {
    var lat = lat * 2 * Math.PI / 360;
    var merclat = 0.5 * Math.log((1 + Math.sin(lat))/ (1 - Math.sin(lat)));
    // We are rectangular, therefore the linear scale is:
    var scale = this.limit() / (2 * Math.PI);
    var centercoord = merclat * scale;
    return Math.round(this.limit() / 2 - centercoord) - this.centery;
}

// Project Y-coordinate to latitude
TerrainMap.prototype.projecty = function(y) {
    var scale = this.limit() / (2 * Math.PI);
    var centercoord = this.limit() / 2 - y - this.centery;
    var merclat = centercoord / scale;
    // Convert mercator coordinate back to degrees
    return Math.atan(sinh(merclat)) * 360 / (2 * Math.PI);
}

// Return best zoom for a given scale
TerrainMap.prototype.nice_google_zoom = function(pscale) {
    var zoom = 17;
    while (zoom > 0) {
        var myscale = 256 / (2 * Math.PI / Math.pow(2, (17 - zoom)));
        if (pscale < myscale)
            break;
        zoom--;
    }
    return zoom + 1;
}

// Get minimum from tracklog statistics
function get_min_tlogs(tracklogs, key) {
    var val = tracklogs[0].igcGetStat(key);
    for (var i=1; i < tracklogs.length; i++) {
        var nval = tracklogs[i].igcGetStat(key);
        if (nval < val)
            val = nval;
    }
    return val;
}

// Get maximum from tracklog statistics
function get_max_tlogs(tracklogs, key) {
    var val = tracklogs[0].igcGetStat(key);
    for (var i=1; i < tracklogs.length; i++) {
        var nval = tracklogs[i].igcGetStat(key);
        if (nval > val)
            val = nval;
    }
    return val;
}

// Move+zoom map so that all tracklogs are visible
TerrainMap.prototype.focus_tracklogs = function() {
    if (!this.tracklogs.length)
        return;

    tlog = this.tracklogs[0];
    var minlon = get_min_tlogs(this.tracklogs, tlog.STAT_LON_MIN);
    var maxlon = get_max_tlogs(this.tracklogs, tlog.STAT_LON_MAX);
    var minlat = get_min_tlogs(this.tracklogs, tlog.STAT_LAT_MIN);
    var maxlat = get_max_tlogs(this.tracklogs, tlog.STAT_LAT_MAX);
    
    // Find ideal zoom level + position
    var xscale = this.main.offsetWidth / (tlog.svgProjectLon(maxlon) - tlog.svgProjectLon(minlon));
    var yscale = this.main.offsetHeight / (tlog.svgProjectLat(maxlat) - tlog.svgProjectLat(minlat));
    if (xscale < yscale)
        var scale = xscale;
    else
        var scale = yscale;
    // Update scale to be a nice value for googlemaps
    this.zoom = this.nice_google_zoom(scale);
    
    // Set left X/Y
    this.centerx = 0;this.centery = 0; // projectlon take into account center(xy) values
    this.centerx = (this.projectlon(minlon) + this.projectlon(maxlon)) / 2;
    this.centerx -= this.main.offsetWidth / 2;
    this.centery = (this.projectlat(minlat) + this.projectlat(maxlat)) / 2;
    this.centery -= this.main.offsetHeight / 2;
    this.x = 0; this.y = 0;
    this.dragarea.style.left = '0px';
    this.dragarea.style.top = '0px';
    
    this.clean_map();
    this.load_maps();
    this.reload_tracklogs();
    this.show_scale();
}

// Set tracklogs to be shown
TerrainMap.prototype.set_tracklogs = function(tracklogs) {
    this.tracklogs = tracklogs;
    this.optimizations = [];
    this.focus_tracklogs();
}

// Set optimization data to be drawn
TerrainMap.prototype.set_optimizations = function(optimizations) {
    this.optimizations = optimizations;
    this.reload_optimizations();
}

// Redraw newly all optimizations
TerrainMap.prototype.reload_optimizations = function() {
    empty(this.optimarea);
    empty(this.optresarea);
    for (var i=0; i < this.optimizations.length; i++)
        this.draw_optimization(i);
}

// Draw optimization data
TerrainMap.prototype.draw_optimization = function(i) {
    var opt = this.optimizations[i];
    
    var startx = this.projectlon(opt.drawMin[1]) - 20;
    var starty = this.projectlat(opt.drawMax[0]) - 20;
    
    var width = this.projectlon(opt.drawMax[1]) - startx + 30;
    var height = this.projectlat(opt.drawMin[0]) - starty + 30;
    
    // limit size of the canvas, if needed, use a smaller one
    if (width > this.main.offsetWidth * 3) {
        width = this.main.offsetWidth * 3;
        startx = this.x + this.main.offsetWidth / 2 - width / 2;
        this.degraded_tracklogs = true;
    }
    if (height > this.main.offsetHeight * 3) {
        height = this.main.offsetHeight * 3;
        starty = this.y + this.main.offsetHeight / 2 - height / 2;
        this.degraded_tracklogs = true;
    }
    
    var canvas = document.createElementNS(htmlns, 'canvas');
    canvas.setAttribute('width', width);
    canvas.setAttribute('height', height);
    canvas.style.top = starty + 'px';
    canvas.style.left = startx + 'px';
    canvas.style.zIndex = 1020;
    canvas.style.position = 'absolute';
    
    ctx = canvas.getContext('2d');
    
    // Draw lines
    ctx.strokeStyle = 'red';
    for (var i=0; i < opt.drawLines.length; i++) {
        ctx.beginPath();
        var x = this.projectlon(opt.drawLines[i][0][1]) - startx;
        var y = this.projectlat(opt.drawLines[i][0][0]) - starty;
        ctx.moveTo(x, y);
        x = this.projectlon(opt.drawLines[i][1][1]) - startx;
        y = this.projectlat(opt.drawLines[i][1][0]) - starty;
        ctx.lineTo(x, y);
        ctx.stroke();
    }
    
    // Draw texts
    ctx.font = 'bold 10px Arial';
    ctx.textBaseline = 'top';
    for (var i=0; i < opt.drawTexts.length; i++) {
        var text = opt.drawTexts[i][0];
        var x = this.projectlon(opt.drawTexts[i][2]) - startx;
        var y = this.projectlat(opt.drawTexts[i][1]) - starty;
        x -= ctx.measureText(text).width / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
        ctx.fillStyle = '#101010';
        ctx.fillText(text, x+1, y+1);
    }

    // Inject optimized points
    for (var i=0; i < opt.drawPoints.length; i++)
        this.optimarea.appendChild(this.make_icon('turnpoint.png', opt.drawPoints[i][0], opt.drawPoints[i][1]));
    
    // Draw results
    tbl = document.createElementNS(htmlns, 'table');
    tbl.style.padding = '0';
    tbl.style.borderCollapse = 'collapse';
    tbl.style.borderBottom = 'thin solid lightgrey';
    this.add_tbl_line(tbl, _('sc_league'), opt.drawScore.scoreLeague);
    this.add_tbl_line(tbl, _('sc_route'), opt.drawScore.scoreShape);
    this.add_tbl_line(tbl, _('sc_distance'), format_km2(opt.drawScore.scoreDistance * 1000));
    this.add_tbl_line(tbl, _('sc_points'), sprintf('%.2f', opt.drawScore.scorePoints));
    this.optresarea.appendChild(tbl);
    
    this.optimarea.appendChild(canvas);
}

TerrainMap.prototype.add_tbl_line = function(el, t1, t2) {
    var tr = document.createElementNS(htmlns, 'tr');
    el.appendChild(tr);
    
    var td = document.createElementNS(htmlns, 'td');
    td.appendChild(document.createTextNode(t1));
    tr.appendChild(td);
    td.style.padding = '0';
    td.style.paddingRight = '2px';
    
    td = document.createElementNS(htmlns, 'td');
    td.appendChild(document.createTextNode(t2));
    tr.appendChild(td);
    td.style.padding = '0';
}

// Redraw tracklogs (e.g. because of changed zoom level)
TerrainMap.prototype.reload_tracklogs = function() {
    empty(this.tracklogarea);
    this.degraded_tracklogs = false;
    for (var i=0; i < this.tracklogs.length; i++)
        this.draw_tracklog(i);
    this.reload_optimizations();
}

// Create an icon that should be shown on the map
TerrainMap.prototype.make_icon = function(png, lat, lon) {
    var icon = document.createElementNS(htmlns, 'img');
    icon.setAttribute('src', png);
    icon.style.position = 'absolute';
    icon.style.zIndex = 1100;
    icon.style.marginTop = '-34px';
    icon.style.marginLeft = '-10px';
    icon.style.top = this.projectlat(lat) + 'px';
    icon.style.left = this.projectlon(lon) + 'px';
    
    return icon;
}

// Create a canvas with a tracklog
TerrainMap.prototype.make_canvas = function(tlog, i) {
    var canvas = document.createElementNS(htmlns, 'canvas');
    
    var scale = this.limit() / (2 * Math.PI);
    var minlon = tlog.igcGetStat(tlog.STAT_LON_MIN);
    var maxlon = tlog.igcGetStat(tlog.STAT_LON_MAX);
    var minlat = tlog.igcGetStat(tlog.STAT_LAT_MIN);
    var maxlat = tlog.igcGetStat(tlog.STAT_LAT_MAX);
    
    var startx = this.projectlon(minlon);
    var starty = this.projectlat(maxlat);
    
    var width = this.projectlon(maxlon) - this.projectlon(minlon) + 1;
    var height = this.projectlat(minlat) - this.projectlat(maxlat) + 1;
    
    // limit size of the canvas, if needed, use a smaller one
    if (width > this.main.offsetWidth * 3) {
        width = this.main.offsetWidth * 3;
        startx = this.x + this.main.offsetWidth / 2 - width / 2;
        this.degraded_tracklogs = true;
    }
    if (height > this.main.offsetHeight * 3) {
        height = this.main.offsetHeight * 3;
        starty = this.y + this.main.offsetHeight / 2 - height / 2;
        this.degraded_tracklogs = true;
    }
    
    canvas.setAttribute('width', width);
    canvas.setAttribute('height', height);
    canvas.style.top = starty + 'px';
    canvas.style.left = startx + 'px';
    canvas.style.zIndex = 1000;
    canvas.style.position = 'absolute';
    
    var ctx = canvas.getContext('2d');
    ctx.strokeStyle = sprintf('rgb(%d,%d,%d)', 255 - ((i * 50) % 250), (170 + i * 40) % 250, (60 + i * 30) % 250);

    tlog.drawCanvasTrack(ctx, this.limit(), startx + this.centerx, starty + this.centery);

    return canvas;
}

// Create a tracklog and pinpoint it on a dragarea
TerrainMap.prototype.draw_tracklog = function(tidx) {
    var tlog = this.tracklogs[tidx];
    var start = tlog.igcPoint(0);
    var starticon = this.make_icon('start.png', start.lat, start.lon);
    this.tracklogarea.appendChild(starticon);

    var cil = tlog.igcPoint(tlog.igcPointCount() - 1);
    var cilicon = this.make_icon('cil.png', cil.lat, cil.lon);
    this.tracklogarea.appendChild(cilicon);
    
    this.tracklogarea.appendChild(this.make_canvas(tlog, tidx));
}

// Return dimension of the map given the current zoom level
TerrainMap.prototype.limit = function() {
    return 256 * (1 << (17 - this.zoom));
}

// Remove all images from a map
TerrainMap.prototype.clean_map = function() {
    this.dragging = false;
    this.loaded_tiles = Array();
    empty(this.maparea);
}

// Zoom out, leave the center of the map in place
TerrainMap.prototype.zoom_out = function() {
    if (this.zoom == 17)
        return;
    this.zoom++;
    this.clean_map();
    // Update X/Y coordinates, so that the center remains at the same place
    this.centerx = Math.floor((this.realx + this.main.offsetWidth/2) / 2) - this.main.offsetWidth / 2;
    if (this.centerx < 0)
        this.centerx = 0;
    this.centery = Math.floor((this.realy + this.main.offsetHeight/2) / 2) - this.main.offsetHeight / 2;
    if (this.centery < 0)
        this.centery = 0;
    this.x = 0; this.y = 0;
    this.dragarea.style.left = '0px';
    this.dragarea.style.top = '0px';

    this.load_maps();
    this.reload_tracklogs();
    this.show_scale();
}

// Zoom in, leave the center of the map inplace
TerrainMap.prototype.zoom_in = function() {
    // Pixel offsets are too high for zoom=0, don't allow it
    if (this.zoom == 0)
        return;
    this.zoom--;
    // Clean up map area
    this.clean_map();
    // Restore centering
    this.centerx = Math.floor((this.x + this.centerx + this.main.offsetWidth/2) * 2 - this.main.offsetWidth / 2);
    this.centery = Math.floor((this.y + this.centery + this.main.offsetHeight/2) * 2 - this.main.offsetHeight / 2);
    this.x = 0;
    this.y = 0;
    this.dragarea.style.left = '0px';
    this.dragarea.style.top = '0px';
        
    this.load_maps();
    this.reload_tracklogs();
    this.show_scale();
}

// Load visible images into dragarea
TerrainMap.prototype.load_maps = function() {
    // Show areas that are outside the bounds function
    for (var x=this.x + this.centerx; x < this.x + this.centerx + this.main.clientWidth + 256; x += 256)
        for (var y=this.y + this.centery; y < this.y + this.centery + this.main.clientHeight + 256; y += 256) {
            if (x >= this.limit() || y >= this.limit())
                continue;
            
            var xtile = Math.floor(x / 256);
            var ytile = Math.floor(y / 256);
            for (var layerid=0; layerid < this.maplayers.length; layerid++) {
                var maptype = this.maplayers[layerid];
                var mapsuffix = '';
                if (maptype != 'map_pgweb' && maptype != 'map_airspace')
                    mapsuffix = get_string_pref(maptype);
                var link = this.get_map_link(maptype, this.zoom, xtile, ytile, mapsuffix);
                // Link is not unique, use different string to avoid
                // loading the same image multiple times
                var lid = maptype + this.zoom + ' ' + xtile + ' ' + ytile + ' ' + mapsuffix;
                if (!this.loaded_tiles[lid]) {
                    this.loaded_tiles[lid] = true;
                    img = document.createElementNS(htmlns, 'img');
                    img.setAttribute('src', link);
                    img.style.left = (xtile * 256 - this.centerx) + 'px';
                    img.style.top = (ytile * 256 - this.centery) + 'px';
                    img.style.width = '256px';
                    img.style.height = '256px';
                    img.style.position = 'absolute';
                    img.style.zIndex = 100 + layerid;
                    this.maparea.appendChild(img);
                }
            }
        }
};

// Return a link for a given map
TerrainMap.prototype.get_map_link = function(maptype, zoom, xtile, ytile, mapsuffix) {
    if (maptype == 'map_googlemap') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/' + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_googleoverlay') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/'  + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_terrain') {
        var svr = 'mt' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/'  + mapsuffix;
        link += '&x=' + xtile + '&y=' + ytile + '&z=' + (17 - zoom);
        // Security?
        link += '&s=' + 'Galileo'.substr(0, (xtile*3+ytile) % 8);
    } else if (maptype == 'map_pgweb') {
        var link = 'http://maps.pgweb.cz/elev/';
        link += (17-zoom) + '/' + xtile + '/' + ytile;
    } else if (maptype == 'map_airspace') {
        var link = 'http://maps.pgweb.cz/airspace/';
        link += (17-zoom) + '/' + xtile + '/' + ytile;
    } else if (maptype == 'map_googlesat') {
        var svr = 'khm' + Math.floor(Math.random() * 4);
        var link = 'http://' + svr + '.google.com/' + mapsuffix;

        var zstring = '';
        for (var i=zoom; i < 17; i++) {
            var xmod = xtile % 2;
            var ymod = ytile % 2;
            
            xtile = Math.floor(xtile / 2);
            ytile = Math.floor(ytile / 2);
            
            if (xmod == 0 && ymod == 0)
                zstring = 'q' + zstring;
            else if (xmod == 1 && ymod == 0)
                zstring = 'r' + zstring;
            else if (xmod == 1 && ymod == 1)
                zstring = 's' + zstring;
            else
                zstring = 't' + zstring;
        }
        zstring = 't' + zstring;
        link += '&t=' + zstring;
    }
    return link;
};
