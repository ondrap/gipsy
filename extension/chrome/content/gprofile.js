htmlns = "http://www.w3.org/1999/xhtml";

// Profile strip object
function TracklogProfile(id, height) {
    var self = this;
    this.main = document.getElementById(id);
    this.main.style.backgroundColor = 'white';
    this.main.style.position = 'relative';
    this.main.style.overflow = 'hidden';
    this.main.style.height = height + 'px';
    
    this.canvas = document.createElementNS(htmlns, 'canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.setAttribute('height', height);
    this.main.appendChild(this.canvas);
    
    this.labels = document.createElementNS(htmlns, 'div');
    this.main.appendChild(this.labels);
    
    this.resize = function(evt) {
        self.canvas.setAttribute('width', self.main.offsetWidth);
        self.draw();
    }
    this.resize();
    window.addEventListener('resize', this.resize, false);
    
    this.tracklog = null;
}

TracklogProfile.prototype.max_height = function() {
    var maxheight = this.tracklog.igcGetStat(tlog.STAT_HEIGHT_MAX);
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2;
    return (Math.floor(maxheight / divider) + 1) * divider;
}

TracklogProfile.prototype.min_height = function() {
    var maxheight = this.tracklog.igcGetStat(tlog.STAT_HEIGHT_MIN);
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2;
    return (Math.floor(maxheight / divider)) * divider;
}

TracklogProfile.prototype.draw_heightlines = function(ctx, scale, minheight, maxheight) {
    var divider = 500;
    if (!get_bool_pref('metric'))
            divider = 457.2; // 1500 ft

    for (var height=minheight; height < maxheight; height += divider) {
        ctx.beginPath();
        var y = Math.floor(this.canvas.height - scale * (height - minheight));
        if (height % (divider * 2)) {
            ctx.strokeStyle = 'darkgray';
        } else {
            ctx.strokeStyle = 'black';
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';
            ctx.fillText(height + ' m', 0, y + 2);
        }
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(this.canvas.width, y + 0.5);
        ctx.stroke();
    }
}

TracklogProfile.prototype.draw = function() {
    if (!this.tracklog)
        return;
    
    var tlog = this.tracklog;
    
    var maxheight = this.max_height();
    var minheight = this.min_height();
    // TODO: divider*2 kvuli non-metric systemum
    if (maxheight - minheight < 1000) {
        if (minheight > 0)
            minheight = 0;
    }
    var scale = this.canvas.offsetHeight / (maxheight - minheight);
    
    ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.beginPath();
    ctx.strokeStyle = 'orange';
    for (var x=0; x < this.canvas.width; x++) {
        var pidx = Math.floor((tlog.igcPointCount() / this.canvas.width) * x);
        var point = tlog.igcPoint(pidx);
        y = Math.floor(this.canvas.offsetHeight - (point.alt - minheight) * scale);
        if (x == 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(this.canvas.width, this.canvas.height);
    ctx.lineTo(0, this.canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'lightgrey';
    ctx.fill();
    
    this.draw_heightlines(ctx, scale, minheight, maxheight);
}

TracklogProfile.prototype.set_tracklog = function(tracklog) {
    this.tracklog = tracklog;
    this.draw();
}
