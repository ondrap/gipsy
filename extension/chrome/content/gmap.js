// 'GoogleMaps'-like API

htmlns = "http://www.w3.org/1999/xhtml";

function TerrainMap(id) {
    var self = this;

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
    
    // Add map
    this.maparea = document.createElementNS(htmlns, 'div');
    this.dragarea.appendChild(this.maparea);

    this.dragging = false;
    this.x = 0;
    this.y = 0;
    this.zoom = 14;
    // Array to store loaded tiles
    this.loaded_tiles = new Array();

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
            self.load_images();
        }
    }
    this.mousemove = function(evt) {
        if (!self.dragging)
            return;
        self.x += self.lastx - evt.clientX;
        self.y += self.lasty - evt.clientY;
        
        // Check map limits
        var xlimit = 256 * (1 << (17 - self.zoom)) - self.main.offsetWidth;
        var ylimit = 256 * (1 << (17 - self.zoom)) - self.main.offsetHeight;
        if (self.x > xlimit)
            self.x = xlimit;
        if (self.y > ylimit)
            self.y = ylimit;
        
        if (self.x < 0)
            self.x = 0;
        if (self.y < 0)
            self.y = 0;

        self.dragarea.style.left = (-self.x).toString() + 'px';
        self.dragarea.style.top = (-self.y).toString() + 'px';
        self.lastx = evt.clientX;
        self.lasty = evt.clientY;
        self.load_images();
    }
    this.resize = function() {
        self.load_images();
    }
    this.dblclick = function(evt) {
        // Move center to the place of the doubleclick
        var lx = evt.clientX - findPosX(self.main);
        var ly = evt.clientY - findPosY(self.main);
        self.x += lx - Math.floor(self.main.offsetWidth / 2);
        if (self.x < 0)
            self.x = 0;
        self.y += ly - Math.floor(self.main.offsetHeight / 2);
        if (self.y < 0)
            self.y = 0;
        self.zoom_in();
    }
    
    this.dragarea.addEventListener('mousedown', this.mousedown, false);
    this.dragarea.addEventListener('mousemove', this.mousemove, false);
    this.dragarea.addEventListener('dblclick', this.dblclick, false);
    window.addEventListener('resize', this.resize, false);
    window.addEventListener('mouseup', this.mouseup, false);

    this.maplayers = [];
}

TerrainMap.prototype.set_layers = function(layers) {
    this.maplayers = layers;
    this.clean_map();
    this.load_images();
}

TerrainMap.prototype.gen_img = function(png, x, y) {
    var zoomin = document.createElementNS(htmlns, 'img');
    zoomin.setAttribute('src', png);
    zoomin.style.position = 'absolute';
    zoomin.style.zIndex = '300';
    zoomin.style.top = y + 'px';
    zoomin.style.left = x + 'px';
    zoomin.style.cursor = 'pointer';
    return zoomin;
}

TerrainMap.prototype.clean_map = function() {
    this.loaded_tiles = Array();
    while ( this.maparea.childNodes.length >= 1 )
        this.maparea.removeChild(this.maparea.firstChild);
}

// Zoom out, leave the center of the map in place
TerrainMap.prototype.zoom_out = function() {
    if (this.zoom == 17)
        return;
    this.zoom++;
    this.clean_map();
    // Update X/Y coordinates, so that the center remains at the same place
    this.x = Math.floor((this.x + this.main.offsetWidth/2) / 2) - this.main.offsetWidth / 2;
    if (this.x < 0)
        this.x = 0;
    this.y = Math.floor((this.y + this.main.offsetHeight/2) / 2) - this.main.offsetHeight / 2;
    if (this.y < 0)
        this.y = 0;
    this.dragarea.style.left = (-this.x).toString() + 'px';
    this.dragarea.style.top = (-this.y).toString() + 'px';

    this.load_images();
}

// Zoom in, leave the center of the map inplace
TerrainMap.prototype.zoom_in = function() {
    if (this.zoom == 0)
        return;
    this.zoom--;
    // Clean up map area
    this.clean_map();
    this.x = Math.floor((this.x + this.main.offsetWidth/2) * 2) - this.main.offsetWidth / 2;
    this.y = Math.floor((this.y + this.main.offsetHeight/2) * 2) - this.main.offsetHeight / 2;
    this.dragarea.style.left = (-this.x).toString() + 'px';
    this.dragarea.style.top = (-this.y).toString() + 'px';
        
    this.load_images();
    
}

TerrainMap.prototype.load_images = function() {
    // Show areas that are outside the bounds function
    for (var x=this.x; x < this.x + this.main.clientWidth + 256; x += 256)
        for (var y=this.y; y < this.y + this.main.clientHeight + 256; y += 256) {
            var xtile = Math.floor(x / 256);
            var ytile = Math.floor(y / 256);
            for (var layerid=0; layerid < this.maplayers.length; layerid++) {
                var maptype = this.maplayers[layerid];
                var mapsuffix = '';
                if (maptype != 'map_pgweb' && maptype != 'map_airspace')
                    mapsuffix = get_string_pref(maptype);
                var link = this.get_map_link(maptype, this.zoom, xtile, ytile, mapsuffix);
                if (!this.loaded_tiles[link]) {
                    this.loaded_tiles[link] = true;
                    img = document.createElementNS(htmlns, 'img');
                    img.setAttribute('src', link);
                    img.style.left = (xtile * 256) + 'px';
                    img.style.top = (ytile * 256) + 'px';
                    img.style.width = '256px';
                    img.style.height = '256px';
                    img.style.position = 'absolute';
                    img.style.zIndex = 100 + layerid;
                    this.maparea.appendChild(img);
                }
            }
        }
};

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
