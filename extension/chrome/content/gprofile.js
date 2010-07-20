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
            ctx.strokeStyle = '#b9b9b9';
        } else {
            ctx.strokeStyle = '#797979';
            ctx.fillStyle = 'black';
            ctx.textBaseline = 'top';
            ctx.fillText(height + ' m', 0, y + 2);
        }
        ctx.moveTo(0, y + 0.5); // WHY??? we must do +0.5 to get a perfectly aligned line???
        ctx.lineTo(this.canvas.width, y + 0.5);
        ctx.stroke();
    }
}

// Draw time scale
TracklogProfile.prototype.draw_timelines = function(ctx, starttime, endtime) {
    var tscale = this.canvas.width / (endtime - starttime);

    var date = new Date(starttime);
    date.setUTCMinutes(0);
    date.setUTCSeconds(0);
    date.setUTCMilliseconds(0);
    date.setUTCHours(date.getUTCHours() + 1);
    
    INTERVAL = 300 * 1000;
    HOURSTICK = 10;
    MINUTESTICK30 = 7;
    MINUTESTICK5 = 4;
    
    var time = date.valueOf();
    // Whole hour
    var dhour = date.valueOf();
    for (time = date.valueOf(); time - INTERVAL > starttime; time -= INTERVAL)
        ;
    ctx.strokeStyle = 'black';
    for (; time < endtime; time += INTERVAL) {
        var x = Math.floor((time - starttime) * tscale) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, this.canvas.height);
        if (!((time - dhour) % (3600 * 1000))) {
            ctx.lineTo(x, this.canvas.height - HOURSTICK);
            ctx.fillStyle = '#4697c0';
            ctx.textBaseline = 'bottom';
            var acdate = new Date(time);
            var text = acdate.getUTCHours() + ':00';
            ctx.fillText(text, x + 2, this.canvas.height - MINUTESTICK30);
        } else if (!((time - dhour) % (1800 * 1000)))
            ctx.lineTo(x, this.canvas.height - MINUTESTICK30);
        else 
            ctx.lineTo(x, this.canvas.height - MINUTESTICK5);
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
    ctx.fillStyle = 'lightgrey';
    
    var starttime = tlog.igcPoint(0).time;
    var endtime = tlog.igcPoint(tlog.igcPointCount() - 1).time;
    var timescale = this.canvas.width / (endtime - starttime);
    
    var lasttime = 0;
    var startx = 0;
    var lastx = 0;
    for (var i=0; i < tlog.igcPointCount(); i++) {
        var point = tlog.igcPoint(i);
        var x = (point.time - starttime) * timescale;
        y = Math.floor(this.canvas.height - (point.alt - minheight) * scale);
        // Hole in tracklog
        if (lasttime && point.time - lasttime > 60*1000) {
            ctx.stroke();
            ctx.lineTo(lastx, this.canvas.height);
            ctx.lineTo(startx, this.canvas.height);
            ctx.closePath();
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            startx = x;
        }
        if (i == 0)
            ctx.moveTo(x, y);
        else
            ctx.lineTo(x, y);
        
        lasttime = point.time;
        lastx = x;
    }
    ctx.stroke();
    ctx.lineTo(this.canvas.width, this.canvas.height);
    ctx.lineTo(startx, this.canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'lightgrey';
    ctx.fill();
    
    // Draw top and bottom black lines
    ctx.strokeStyle = 'black';
    ctx.beginPath();ctx.moveTo(0, 0.5);ctx.lineTo(this.canvas.width, 0.5); ctx.stroke();
    ctx.beginPath();ctx.moveTo(0, this.canvas.height - 0.5);
    ctx.lineTo(this.canvas.width, this.canvas.height - 0.5); ctx.stroke();
    
    this.draw_heightlines(ctx, scale, minheight, maxheight);
    this.draw_timelines(ctx, starttime, endtime);
}

TracklogProfile.prototype.set_tracklog = function(tracklog) {
    this.tracklog = tracklog;
    this.draw();
}
