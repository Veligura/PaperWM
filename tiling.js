
// Globals
glib = imports.gi.GLib
Tweener = imports.ui.tweener;

// Gap between windows
window_gap = 10
// Top/bottom margin
margin_tb = 2
// left/right margin
margin_lr = 20
stack_margin = 75

statusbar = undefined
global.stage.get_first_child().get_children().forEach((actor) => {
    if ("panelBox" == actor.name) {
        statusbar = actor
    }
})
statusbar_height = statusbar.height
margin_tb = 2

stack_margin = 75

Spaces = new Lang.Class({
    Name: 'Spaces',

    spaces: [],

    _init : function() {
        // Initialize a space for all existing meta workspaces
        for (let i=0; i < global.screen.n_workspaces; i++) {
            this.spaces[i] = new Space(global.screen.get_workspace_by_index(i));
        }
    },

    add: function(workspace) {
        this.spaces[workspace.workspace_index] = new Space(workspace);
    },

    remove: function(workspace) {
        this.spaces.splice(workspace.workspace_index, 1);
    },

    spaceOf: function(meta_window) {
        let workspace = meta_window.get_workspace();
        return this.spaces[workspace.workspace_index];
    }
})

Space = new Lang.Class({
    Name: 'Space',

    // The stack of windows
    stack: [],

    // The associated MetaWorkspace
    workspace: undefined,

    // The workspace index
    index: undefined,

    // index of the last window on the left stack
    leftStack: 0,

    // index of the first window on the right stack
    rightStack: 0,

    _init: function(workspace) {
        this.workspace = workspace;
        this.index = workspace.workspace_index;
    },

    moveIntoView: function(meta_window) {
        ensure_viewport(meta_window);
    },

    // Get the index right of meta_window's index
    rightOf: function(meta_window) {
        return Math.min(this.columnOf(meta_window) + 1, this.stack.length - 1);
    },

    // insert `meta_window` at `index`
    insertWindow: function(meta_window, index) {
        // insert at the end by default
        index = index || this.stack.length;
        this.stack.splice(index, 0, meta_window);
    },

    removeWindow: function(meta_window) {
        this.stack.splice(this.indexOf(meta_window), 1, meta_window);
    },

    swap: function(i, j) {
        if (!inBound(i, j)) {
            return false;
        }
        let stack = this.stack;
        let temp = stack[i];
        stack[i] = stack[j];
        stack[j] = temp;
    },

    inBound: function(i, j) {
        return i >= 0 && i < this.stack.length;
    },

    // Get the index left of meta_window's index
    leftOf: function(meta_window) {
        return Math.max(this.columnOf(meta_window) - 1, 0);
    },

    indexOf: function(meta_window) {
        return this.stack.indexOf(meta_window);
    },

    getWindow: function(index) {
        return this.stack[index];
    }
})

spaces = new Spaces();

function _repl() {
    add_all_from_workspace()

    meta_window = global.display.focus_window;
    workspace = meta_window.get_workspace();
    window_actor = meta_window.get_compositor_private();

    set_action_handler("toggle-scratch-layer", () => { print("It works!"); });

    meta_window = pages[0]
//: [object instance proxy GType:MetaWindowX11 jsobj@0x7f8c39e52f70 native@0x3d43880]
    workspace = meta_window.get_workspace()
//: [object instance proxy GIName:Meta.Workspace jsobj@0x7f8c47166790 native@0x23b5360]

    actor = meta_window.get_compositor_private()

    St = imports.gi.St;
    St.set_slow_down_factor(1);
    St.set_slow_down_factor(3);

    actor.z_position

    meta = imports.gi.Meta
    meta_window.get_layer()

    // Use to control the stack level
    meta_window.raise()
    meta_window.lower()

}

debug_all = true; // Consider the default value in `debug_filter` to be true
debug_filter = { "#preview": false };
debug = () => {
    let keyword = arguments[0];
    let filter = debug_filter[keyword];
    if (filter === false)
        return;
    if (debug_all || filter === true)
        print(Array.prototype.join.call(arguments, " | "));
}

print_stacktrace = () => {
    let trace = (new Error()).stack.split("\n")
    // Remove _this_ frame
    trace.splice(0, 1);
    // Remove some uninteresting frames
    let filtered = trace.filter((frame) => {
        return frame !== "wrapper@resource:///org/gnome/gjs/modules/lang.js:178"   
    });
    let args = Array.prototype.splice.call(arguments);
    args.splice(0, 1, "stacktrace:"+(args[0] ? args[0] : ""))
    // Use non-breaking space to encode new lines (otherwise every frame is
    // prefixed by timestamp)
    let nl = " ";
    args.push(nl+filtered.join(nl))
    debug.apply(null, args);
}

focus = () => {
    let meta_window = global.display.focus_window;
    if (!meta_window)
        return -1;
    return spaces.spaceOf(meta_window).indexOf(meta_window);
}

// Max height for windows
max_height = global.screen_height - statusbar_height - margin_tb*2;
// Height to use when scaled down at the sides
scaled_height = max_height*0.95;
scaled_y_offset = (max_height - scaled_height)/2;
move = (meta_window, x, y, onComplete, onStart, delay, transition) => {
    let actor = meta_window.get_compositor_private()
    let buffer = actor.meta_window.get_buffer_rect();
    let frame = actor.meta_window.get_frame_rect();
    x = Math.min(global.screen_width - stack_margin, x)
    x = Math.max(stack_margin - frame.width, x)
    let x_offset = frame.x - buffer.x;
    let y_offset = frame.y - buffer.y;
    let scale = 1;
    delay = delay || 0;
    transition = transition || "easeInOutQuad";
    if (x >= global.screen_width - stack_margin || x <= stack_margin - frame.width) {
        // Set scale so that the scaled height will be `scaled_height`
        scale = scaled_height/frame.height;
        // Center the actor properly
        y += scaled_y_offset;
        let pivot = actor.pivot_point;
        actor.set_pivot_point(pivot.x, y_offset/buffer.height);
    }
    Tweener.addTween(actor, {x: x - x_offset
                             , y: y - y_offset
                             , time: 0.25 - delay
                             , delay: delay
                             , scale_x: scale
                             , scale_y: scale
                             , transition: transition
                             , onStart: () => {
                                 onStart && onStart();
                             }
                             , onComplete: () => {
                                 actor.meta_window.move_frame(true, x, y);
                                 onComplete && onComplete();
                             }})

}

timestamp = () => {
    return glib.get_monotonic_time()/1000
}

ensuring = false;
ensure_viewport = (meta_window, force) => {
    if (ensuring == meta_window && !force) {
        debug('already ensuring', meta_window.title);
        return;
    }
    debug('Ensuring', meta_window.title);

    let space = spaces.spaceOf(meta_window);
    let index = space.indexOf(meta_window)
    function move_to(meta_window, x, y, delay, transition) {
        ensuring = meta_window;
        move(meta_window, x, y
             , () => { ensuring = false; }
             , () => { meta_window.raise(); }
             , delay
             , transition
            );
        propogate_forward(space, index + 1, x + frame.width + window_gap, false);
        propogate_backward(space, index - 1, x - window_gap, false);
    }

    let frame = meta_window.get_frame_rect();
    // Share the available margin evenly between left and right
    // if the window is wide (should probably use a quotient larger than 2)
    let margin = margin_lr
    if (frame.width > global.screen_width - 2 * margin_lr)
        margin = (global.screen_width - frame.width)/2;

    // Hack to ensure the statusbar is visible while there's a fullscreen
    // windows in the space. TODO fade in/out in some way.
    if (!statusbar.visible) {
        statusbar.visible = true;
    }

    let x = frame.x;
    let y = statusbar_height + margin_tb;
    let required_width = space.stack.reduce((length, meta_window) => {
        let frame = meta_window.get_frame_rect();
        return length + frame.width + window_gap;
    }, -window_gap);
    if (meta_window.fullscreen) {
        // Fullscreen takes highest priority
        x = 0, y = 0;
        statusbar.visible = false;

    } else if (required_width <= global.screen_width) {
        let leftovers = global.screen_width - required_width;
        let gaps = space.stack.length + 1;
        let extra_gap = leftovers/gaps;
        debug('#extragap', extra_gap);
        propogate_forward(space, 0, extra_gap, true, extra_gap + window_gap);
        return;
    } else if (index == 0) {
        // Always align the first window to the display's left edge
        x = 0;
    } else if (index == space.stack.length-1) {
        // Always align the first window to the display's right edge
        x = global.screen_width - frame.width;
    } else if (frame.x + frame.width >= global.screen_width - margin) {
        // Align to the right margin
        x = global.screen_width - margin - frame.width;
    } else if (frame.x <= margin) {
        // Align to the left margin
        x = margin;
    }
    // Add a delay for stacked window to avoid windows passing
    // through each other in the z direction

    let delay = 0;
    let transition;
    if (meta_window.get_compositor_private().is_scaled()) {
        // easeInQuad: delta/2(t/duration)^2 + start
        delay = Math.pow(2*(stack_margin - margin_lr)/frame.width, .5)*0.25/2;
        transition = 'easeInOutQuad';
        debug('delay', delay)
    }
    move_to(meta_window, x, y, delay, transition);
}

framestr = (rect) => {
    return "[ x:"+rect.x + ", y:" + rect.y + " w:" + rect.width + " h:"+rect.height + " ]";
}

focus_handler = (meta_window, user_data) => {
    debug("focus:", meta_window.title, framestr(meta_window.get_frame_rect()));

    if(meta_window.scrollwm_initial_position) {
        debug("setting initial position", meta_window.scrollwm_initial_position)
        if (meta_window.get_maximized() == Meta.MaximizeFlags.BOTH) {
            meta_window.unmaximize(Meta.MaximizeFlags.BOTH);
            toggle_maximize_horizontally(meta_window);
            return;
        }
        let frame = meta_window.get_frame_rect();
        meta_window.move_resize_frame(true, meta_window.scrollwm_initial_position.x, meta_window.scrollwm_initial_position.y, frame.width, frame.height)
        ensure_viewport(meta_window);
        delete meta_window.scrollwm_initial_position;
    } else {
        ensure_viewport(meta_window)
    }
}

// Place window's left edge at x
propogate_forward = (space, n, x, lower, gap) => {
    if (n < 0 || n >= space.stack.length)
        return
    gap = gap || window_gap;
    let meta_window = space.getWindow(n);
    if (lower)
        meta_window.lower()
    // Anchor scaling/animation on the left edge for windows positioned to the right,
    meta_window.get_compositor_private().set_pivot_point(0, 0);
    move(meta_window, x, statusbar_height + margin_tb)
    propogate_forward(space, n+1, x+meta_window.get_frame_rect().width + gap, true, gap);
}
// Place window's right edge at x
propogate_backward = (space, n, x, lower, gap) => {
    if (n < 0 || n >= space.stack.length)
        return
    gap = gap || window_gap;
    let meta_window = space.getWindow(n);
    x = x - meta_window.get_frame_rect().width
    // Anchor on the right edge for windows positioned to the left.
    meta_window.get_compositor_private().set_pivot_point(1, 0);
    if (lower)
        meta_window.lower()
    move(meta_window, x, statusbar_height + margin_tb)
    propogate_backward(space, n-1, x - gap, true, gap)
}

center = (meta_window, zen) => {
    let frame = meta_window.get_frame_rect();
    let x = Math.floor((global.screen_width - frame.width)/2)
    move(meta_window, x, frame.y)
    let right = zen ? global.screen_width : x + frame.width + window_gap;
    let left = zen ? -global.screen_width : x - window_gap;
    let i = spaces.spaceOf(meta_window).indexOf(meta_window);
    propogate_forward(i + 1, right);
    propogate_backward(i - 1, left);
}
focus_wrapper = (meta_window, user_data) => {
    focus_handler(meta_window, user_data)
}

add_filter = (meta_window) => {
    if (meta_window.window_type != Meta.WindowType.NORMAL ||
        meta_window.get_transient_for() != null) {
        return false;
    }
    return true;
}

/**
  Modelled after notion/ion3's system

  Examples:

    defwinprop({
        wm_class: "Emacs",
        float: true
    })
*/
winprops = [];

winprop_match_p = (meta_window, prop) => {
    let wm_class = meta_window.wm_class || "";
    let title = meta_window.title;
    if (prop.wm_class !== wm_class) {
        return false;
    }
    if (prop.title) {
        if (prop.title.constructor === RegExp) {
            if (!title.match(prop.title))
                return false;
        } else {
            if (prop.title !== title)
                return false;
        }
    }

    return true;
}

find_winprop = (meta_window) =>  {
    let props = winprops.filter(
        winprop_match_p.bind(null, meta_window));

    return props[0];
}

defwinprop = (spec) => {
    winprops.push(spec);
}

defwinprop({
    wm_class: "copyq",
    float: true
})

add_handler = (ws, meta_window) => {
    debug("window-added", meta_window, meta_window.title, meta_window.window_type);
    if (!add_filter(meta_window)) {
        return;
    }

    let winprop = find_winprop(meta_window);
    if (winprop) {
        if(winprop.oneshot) {
            // untested :)
            winprops.splice(winprops.indexOf(winprop), 1);
        }
        if(winprop.float) {
            // Let gnome-shell handle the placement
            return;
        }
    }

    let focus_i = focus();

    // Should inspert at index 0 if focus() returns -1
    let space = spaces.spaces[ws.workspace_index];
    space.insertWindow(meta_window, focus_i + 1);

    if (focus_i == -1) {
        meta_window.scrollwm_initial_position = {x: 0, y:statusbar_height + margin_tb};
    } else {
        let frame = space.getWindow(focus_i).get_frame_rect()
        meta_window.scrollwm_initial_position = {x:frame.x + frame.width + window_gap, y:statusbar_height + margin_tb};
    }
    // If window is receiving focus the focus handler will do the correct thing.
    // Otherwise we need set the correct position:
    // For new windows this must be done in 'first-frame' signal.
    // Existing windows being moved need a new position in this workspace. This
    // can be done here since the window is fully initialized.

    // Maxmize height. Setting position here doesn't work... 
    meta_window.move_resize_frame(true, 0, 0,
                                  meta_window.get_frame_rect().width, global.screen_height - statusbar_height - margin_tb*2);
    meta_window.connect("focus", focus_wrapper)
}

remove_handler = (ws, meta_window) => {
    debug("window-removed", meta_window, meta_window.title);
    // Note: If `meta_window` was closed and had focus at the time, the next
    // window has already received the `focus` signal at this point.

    let space = spaces.spaceOf(meta_window);
    let removed_i = space.indexOf(meta_window)
    if (removed_i < 0)
        return
    space.removeWindow(meta_window)

    // Remove our signal handlers: Needed for non-closed windows.
    // (closing a window seems to clean out it's signal handlers)
    meta_window.disconnect(focus_wrapper);

    // Re-layout: Needed if the removed window didn't have focus.
    // Not sure if we can check if that was the case or not?
    space.getWindow(Math.max(0, removed_i - 1)).activate(timestamp());
    // Force a new ensure, since the focus_handler is run before window-removed
    ensure_viewport(space.getWindow(focus()), true)
}

add_all_from_workspace = (workspace) => {
    workspace = workspace || global.screen.get_active_workspace();
    let windows = workspace.list_windows();

    // On gnome-shell-restarts the windows are moved into the viewport, but
    // they're moved minimally and the stacking is not changed, so the tiling
    // order is preserved (sans full-width windows..)
    function xz_comparator(windows) {
        // Seems to be the only documented way to get stacking order?
        // Could also rely on the MetaWindowActor's index in it's parent
        // children array: That seem to correspond to clutters z-index (note:
        // z_position is something else)
        let z_sorted = global.display.sort_windows_by_stacking(windows);
        function xkey(mw) {
            let frame = mw.get_frame_rect();
            if(frame.x <= 0)
                return 0;
            if(frame.x+frame.width == global.screen_width) {
                return global.screen_width;
            }
            return frame.x;
        }
        // xorder: a|b c|d
        // zorder: a d b c
        return (a,b) => {
            let ax = xkey(a);
            let bx = xkey(b);
            // Yes, this is not efficient
            let az = z_sorted.indexOf(a);
            let bz = z_sorted.indexOf(b);
            let xcmp = ax - bx;
            if (xcmp !== 0)
                return xcmp;

            if (ax === 0) {
                // Left side: lower stacking first
                return az - bz;
            } else {
                // Right side: higher stacking first
                return bz - az;
            }
        };
    }

    windows.sort(xz_comparator(windows));

    let tiling = spaces.spaces[workspace.workspace_index].stack;
    windows.forEach((meta_window, i) => {
        if(tiling.indexOf(meta_window) < 0 && add_filter(meta_window)) {
            // Using add_handler is unreliable since it interacts with focus.
            tiling.push(meta_window);
            meta_window.connect("focus", focus_wrapper)
        }
    })
}

/**
 * Look up the function by name at call time. This makes it convenient to
 * redefine the function without re-registering all signal handler, keybindings,
 * etc. (this is like a function symbol in lisp)
 */
dynamic_function_ref = (handler_name, owner_obj) => {
    owner_obj = owner_obj || window;
    return function() {
        owner_obj[handler_name].apply(owner_obj, arguments);
    }
}

/**
 * Adapts a function operating on a meta_window to a key handler
 */
as_key_handler = function(fn) {
    if(typeof(fn) === "string") {
        fn = dynamic_function_ref(fn);
    }
    return function(screen, monitor, meta_window, binding) {
        return fn(meta_window);
    }
}

first_frame = (meta_window_actor) => {
    meta_window_actor.disconnect('first_frame');
    let meta_window = meta_window_actor.meta_window;
    debug("first frame: setting initial position", meta_window)
    if(meta_window.scrollwm_initial_position) {
        debug("setting initial position", meta_window.scrollwm_initial_position)
        if (meta_window.get_maximized() == Meta.MaximizeFlags.BOTH) {
            meta_window.unmaximize(Meta.MaximizeFlags.BOTH);
            toggle_maximize_horizontally(meta_window);
            return;
        }
        let frame = meta_window.get_frame_rect();
        meta_window.move_resize_frame(true, meta_window.scrollwm_initial_position.x, meta_window.scrollwm_initial_position.y, frame.width, frame.height)

        let space = spaces.spaceOf(meta_window);
        propogate_forward(space, space.indexOf(meta_window) + 1, meta_window.scrollwm_initial_position.x + frame.width + window_gap);

        delete meta_window.scrollwm_initial_position;
    }
}

window_created = (display, meta_window, user_data) => {
    debug('window-created', meta_window.title);
    let actor = meta_window.get_compositor_private();
    actor.connect('first-frame', dynamic_function_ref('first_frame'));
}

global.display.connect('window-created', dynamic_function_ref('window_created'));

workspace_added = (screen, index) => {
    let workspace = global.screen.get_workspace_by_index(index);
    spaces.add(workspace);
    // Should move this into Spaces.add
    workspace.connect("window-added", dynamic_function_ref("add_handler"))
    workspace.connect("window-removed", dynamic_function_ref("remove_handler"));
    debug('workspace-added', index, workspace);

}
// Doesn't seem to trigger for some reason
workspace_removed = (screen, arg1, arg2) => {
    debug('workspace-removed');
    let workspace = global.screen.get_workspace_by_index(index);
    spaces.remove(workspace);
}

global.screen.connect("workspace-added", dynamic_function_ref('workspace_added'))
global.screen.connect("workspace-removed", dynamic_function_ref('workspace_removed'));

recover_all_tilings = function() {
    for (let i=0; i < global.screen.n_workspaces; i++) {
        let workspace = global.screen.get_workspace_by_index(i)
        print("workspace: " + workspace)
        workspace.connect("window-added", dynamic_function_ref("add_handler"))
        workspace.connect("window-removed", dynamic_function_ref("remove_handler"));
        add_all_from_workspace(workspace);
    }
}
recover_all_tilings();

move_helper = (meta_window, delta) => {
    // NB: delta should be 1 or -1
    let space = spaces.spaceOf(meta_window);
    let i = space.indexOf(meta_window)
    space.swap(i, i+delta);
}
move_right = () => {
    move_helper(global.display.focus_window, 1);
}
move_left = () => {
    move_helper(global.display.focus_window, -1);
}

toggle_maximize_horizontally = (meta_window) => {
    meta_window = meta_window || global.display.focus_window;

    // TODO: make some sort of animation
    // Note: should investigate best-practice for attaching extension-data to meta_windows
    if(meta_window.unmaximized_rect) {
        let unmaximized_rect = meta_window.unmaximized_rect;
        meta_window.move_resize_frame(true,
                                      unmaximized_rect.x, unmaximized_rect.y,
                                      unmaximized_rect.width, unmaximized_rect.height)
        meta_window.unmaximized_rect = undefined;
    } else {
        let frame = meta_window.get_frame_rect();
        meta_window.unmaximized_rect = frame;
        meta_window.move_resize_frame(true, frame.x, frame.y, global.screen_width - margin_lr*2, frame.height);
    }
    ensure_viewport(meta_window);
}

altTab = imports.ui.altTab;

PreviewedWindowNavigator = new Lang.Class({
    Name: 'PreviewedWindowNavigator',
    Extends: altTab.WindowSwitcherPopup,

    _init : function() {
        this.parent();
        this._selectedIndex = focus();
        debug('#preview', 'Init', this._switcherList.windows[this._selectedIndex].title, this._selectedIndex);
    },

    _next: function() {
        return Math.min(this._items.length-1, this._selectedIndex+1)
    },
    _previous: function() {
        return Math.max(0, this._selectedIndex-1)
    },

    _initialSelection: function(backward, binding) {
        if (backward)
            this._select(Math.min(this._selectedIndex, this._previous()));
        else if (this._items.length == 1)
            this._select(0);
        else
            this._select(Math.max(this._selectedIndex, this._next()));
    },

    _getWindowList: function() {
        return spaces.spaceOf(global.display.focus_window).stack;
    },

    _select: function(index) {
        debug('#preview', 'Select', this._switcherList.windows[index].title, index);
        ensure_viewport(this._switcherList.windows[index]);
        this.parent(index);
    },

    _finish: function(timestamp) {
        debug('#preview', 'Finish', this._switcherList.windows[this._selectedIndex].title, this._selectedIndex);
        this.was_accepted = true;
        this.parent(timestamp);
    },

    _itemEnteredHandler: function() {
        // The item-enter (mouse hover) event is triggered even after a item is
        // accepted. This can cause _select to run on the item below the pointer
        // ensuring the wrong window.
        if(!this.was_accepted) {
            this.parent.apply(this, arguments);
        }
    },

    _onDestroy: function() {
        debug('#preview', 'onDestroy', this.was_accepted);
        if(!this.was_accepted && this._selectedIndex != focus()) {
            debug('#preview', 'Abort', global.display.focus_window.title);
            ensure_viewport(global.display.focus_window, true);
        }
        this.parent();
    }
});

LiveWindowNavigator = new Lang.Class({
    Name: 'LiveWindowNavigator',
    Extends: altTab.WindowCyclerPopup,

    _init : function() {
        this.parent();
        this._selectedIndex = focus();
    },

    _next: function() {
        return Math.min(this._items.length-1, this._selectedIndex+1)
    },
    _previous: function() {
        return Math.max(0, this._selectedIndex-1)
    },

    _initialSelection: function(backward, binding) {
        if (backward)
            this._select(this._previous());
        else if (this._items.length == 1)
            this._select(0);
        else
            this._select(this._next());
    },

    _highlightItem: function(index, justOutline) {
        ensure_viewport(this._items[index])
        this._highlight.window = this._items[index];
        global.window_group.set_child_above_sibling(this._highlight.actor, null);
    },

    _getWindows: function() {
        return spaces.spaceOf(global.display.focus_window).stack;
    }
});

/**
 * Navigate the tiling linearly with live preview, but delaying actual focus
 * change until modifier is released.
 */
live_navigate = (display, screen, meta_window, binding) => {
    // Note: the reverse binding only work as indented if the action bound to
    // this function is supported in the base class of LiveWindowNavigator.
    // See altTab.js and search for _keyPressHandler
    let tabPopup = new LiveWindowNavigator();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())
}

preview_navigate = (display, screen, meta_window, binding) => {
    let tabPopup = new PreviewedWindowNavigator();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())
}

// See gnome-shell-extensions-negesti/convenience.js for how to do this when we
// pack this as an actual extension
get_settings = function(schema) {
    const GioSSS = Gio.SettingsSchemaSource;

    schema = schema || "org.gnome.shell.extensions.org-scrollwm";

    // Need to create a proper extension soon..
    let schemaDir = GLib.getenv("HOME")+"/src/paperwm/schemas";
    // let schemaDir = GLib.getenv("HOME")+"/YOUR_PATH_HERE;
    let schemaSource;
    schemaSource = GioSSS.new_from_directory(schemaDir, GioSSS.get_default(), false);

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension ');

    return new Gio.Settings({ settings_schema: schemaObj });
}

set_action_handler = function(action_name, handler) {
    // Ripped from https://github.com/negesti/gnome-shell-extensions-negesti 
    // Handles multiple gnome-shell versions

    if (Main.wm.addKeybinding && Shell.ActionMode){ // introduced in 3.16
        Main.wm.addKeybinding(action_name,
                              get_settings(), Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.NORMAL,
                              handler
                             );
    } else if (Main.wm.addKeybinding && Shell.KeyBindingMode) { // introduced in 3.7.5
        // Shell.KeyBindingMode.NORMAL | Shell.KeyBindingMode.MESSAGE_TRAY,
        Main.wm.addKeybinding(action_name,
                              get_settings(), Meta.KeyBindingFlags.NONE,
                              Shell.KeyBindingMode.NORMAL,
                              handler
                             );
    } else {
        global.display.add_keybinding(
            action_name,
            get_settings(),
            Meta.KeyBindingFlags.NONE,
            handler
        );
    }
}


settings = new Gio.Settings({ schema_id: "org.gnome.desktop.wm.keybindings"});
// Temporary cycle-windows bindings
settings.set_strv("cycle-windows", ["<super><ctrl>period" ])
settings.set_strv("cycle-windows-backward", ["<super><ctrl>comma"])

settings.set_strv("switch-windows", ["<alt>period", "<super>period" ])
settings.set_strv("switch-windows-backward", ["<alt>comma", "<super>comma"])

settings.set_strv("close", ['<super>c'])
settings.set_strv("maximize-horizontally", ['<super>h'])

shell_settings = new Gio.Settings({ schema_id: "org.gnome.shell.keybindings"});
shell_settings.set_strv("toggle-overview", ["<super>space"])

Meta.keybindings_set_custom_handler("cycle-windows",
                                    dynamic_function_ref("live_navigate"));
Meta.keybindings_set_custom_handler("cycle-windows-backward",
                                    dynamic_function_ref("live_navigate"));

Meta.keybindings_set_custom_handler("switch-windows",
                                    dynamic_function_ref("preview_navigate"));
Meta.keybindings_set_custom_handler("switch-windows-backward",
                                    dynamic_function_ref("preview_navigate"));


// Or use "toggle-maximize"?
Meta.keybindings_set_custom_handler("maximize-horizontally",
                                    as_key_handler("toggle_maximize_horizontally"));



// Must use `Meta.keybindings_set_custom_handler` to re-assign handler?
set_action_handler("move-left", dynamic_function_ref("move_left"));
set_action_handler("move-right", dynamic_function_ref("move_right"));
