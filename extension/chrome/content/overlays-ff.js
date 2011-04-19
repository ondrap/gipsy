{
    let GipsyUtil = {};
    Components.utils.import("resource://gipsy/util.jsm", GipsyUtil);

    let myId    = "gipsy-button"; // ID of button to add
    let afterId = "search-container";    // ID of element to insert after
    let navBar  = document.getElementById("nav-bar");

    if (navBar && !GipsyUtil.get_bool_pref('btn_toolbar_added')) {
        let curSet  = navBar.currentSet.split(",");
        if (curSet.indexOf(myId) == -1) {
            let pos = curSet.indexOf(afterId) + 1 || curSet.length;
            let set = curSet.slice(0, pos).concat(myId).concat(curSet.slice(pos));

            navBar.setAttribute("currentset", set.join(","));
            navBar.currentSet = set.join(",");
            document.persist(navBar.id, "currentset");
            try {
                BrowserToolboxCustomizeDone(true);
            } catch (e) {}
            GipsyUtil.set_bool_pref('btn_toolbar_added', true);
        }
    }
}
