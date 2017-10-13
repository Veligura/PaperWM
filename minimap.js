Clutter = imports.gi.Clutter;
Tweener = imports.ui.tweener;
Lang = imports.lang;
St = imports.gi.St;
Workspace = imports.ui.workspace;
Background = imports.ui.background;
Meta = imports.gi.Meta;
Main = imports.ui.main;
Signals = imports.signals;

calcOffset = function(metaWindow) {
    let buffer = metaWindow.get_buffer_rect();
    let frame = metaWindow.get_frame_rect();
    let x_offset = frame.x - buffer.x;
    let y_offset = frame.y - buffer.y;
    return [x_offset, y_offset];
}

WindowCloneLayout = new Lang.Class({
    Name: 'PaperWindowCloneLayout',
    Extends: Clutter.LayoutManager,

    _init: function() {
        this.parent();
    },

    _makeBoxForWindow: function(window) {
        // We need to adjust the position of the actor because of the
        // consequences of invisible borders -- in reality, the texture
        // has an extra set of "padding" around it that we need to trim
        // down.

        // The outer rect (from which we compute the bounding box)
        // paradoxically is the smaller rectangle, containing the positions
        // of the visible frame. The input rect contains everything,
        // including the invisible border padding.
        let inputRect = window.get_buffer_rect();
        let frame = window.get_frame_rect();

        let box = new Clutter.ActorBox();

        box.set_origin((inputRect.x - frame.x),
                       (inputRect.y - frame.y));
        box.set_size(inputRect.width, inputRect.height);

        return box;
    },

    vfunc_get_preferred_height: function(container, forWidth) {
        let frame = container.get_first_child().meta_window.get_frame_rect();
        return [frame.height, frame.height];
    },

    vfunc_get_preferred_width: function(container, forHeight) {
        let frame = container.get_first_child().meta_window.get_frame_rect();
        return [frame.width, frame.width];
    },

    vfunc_allocate: function(container, box, flags) {
        container.get_children().forEach(Lang.bind(this, function (child) {
            let realWindow;
            // if (child == container._delegate._windowClone)
            //     realWindow = container._delegate.realWindow;
            // else
                realWindow = child.source;

            child.allocate(this._makeBoxForWindow(realWindow.meta_window),
                           flags);
        }));
    }
});

Minimap = new Lang.Class({
    Name: 'Minimap',

    _init: function(space) {
        this.actor = new Clutter.Actor({ name: "minimap-actor" });
        this.space = space;
        this.minimapActor = new Clutter.Actor({ name: "minimap-container"} );

        this.clones = [];

        this.viewport = new Clutter.Actor({ name: "minimap-viewport" });
        this.viewport.set_scale(0.1, 0.1);
        this.viewport.height = primary.height;
        this.viewport.width = primary.width;
        this.viewport.add_actor(this.minimapActor);

        this.actor.width = primary.width*0.1;
        this.actor.height = primary.height*0.1+30;

        let workspaceName = Meta.prefs_get_workspace_name(space.workspace.index());
        this.label = new St.Label({ text: workspaceName })
        this.label.y = primary.height*0.1
        this.label.set_style("background-color: black")
        
        this.actor.add_child(this.viewport)
        this.actor.add_child(this.label)
        this.viewport.set_background_color(Clutter.Color.get_static(3))
        this.popupLabel = new St.Label({ style: "background-color: black" });
        this.popupLabel.x = 100;
        this.popupLabel.y = -30;
        this.actor.add_child(this.popupLabel);
    },

    createClones: function(windows) {
        return windows.map((mw) => {
            let windowActor = mw.get_compositor_private()
            let clone = new Clutter.Clone({ source: windowActor });
            let container = new Clutter.Actor({ layout_manager: new WindowCloneLayout(),
                                                name: "window-clone-container",
                                                reactive: true
                                              });
            Main.layoutManager._trackActor(container)
            let popupLabel = this.popupLabel;
            container.connect("enter-event", () => {
                popupLabel.text = mw.title;
                popupLabel.show();
                
            });
            container.connect("leave-event", () => {
                popupLabel.text = "";
                popupLabel.hide();
            });
            let minimapThis = this;
            container.connect("button-press-event", () => {
                debug("minimap", "item-activated");
                minimapThis.emit("item-activated", this.space.indexOf(mw));
            });
            clone.meta_window = mw;

            container.add_actor(clone);
            return container;
        });

    },

    restack: function (around) {
        this.minimapActor.remove_all_children();
        let clones = this.clones;

        for (let i=0; i < around; i++) {
            this.minimapActor.add_actor(clones[i]);
        }
        for (let i=clones.length-1; i>around; i--) {
            this.minimapActor.add_actor(clones[i]);
        }
        this.minimapActor.add_actor(clones[around]);
    },

    fold: function (around, animate = true) {
        around = around || this.space.indexOf(this.space.selectedWindow);
        if (around < 0) {
            return;
        }

        let time = 0;
        if (animate) {
            time = 0.25;
        }

        this.restack(around);
        let clones = this.clones;

        let maxProtrusion = 500;
        let leftStackGap = maxProtrusion/(around);
        let rightStackGap = maxProtrusion/(clones.length - 1 - around);
        for (let i=0; i < around; i++) {
            let clone = clones[i];
            clone.set_pivot_point(0, 0.5);
            if (clone.x + this.minimapActor.x <= -maxProtrusion) {
                Tweener.addTween(clone, {x: -this.minimapActor.x
                                         - (maxProtrusion - i*leftStackGap)
                                         , scale_x: 0.9
                                         , scale_y: 0.9
                                         , transition: "easeInOutQuad"
                                         , time: time});
            } else {
                this.minimapActor
                    .set_child_above_sibling(clone,
                                             this.minimapActor.last_child);
            }
        }
        for (let i=clones.length-1; i>around; i--) {
            let clone = clones[i];
            clone.set_pivot_point(1, 0.5);
            if (clone.x + clone.width + this.minimapActor.x >= primary.width + maxProtrusion) {
                Tweener.addTween(clone, {x: -this.minimapActor.x
                                         + primary.width
                                         + (maxProtrusion - (clones.length-1 - i)*rightStackGap) - clone.width
                                         , scale_x: 0.9
                                         , scale_y: 0.9
                                         , transition: "easeInOutQuad"
                                         , time: time});
            }
        }
    },

    unfold: function (animate = true) {
        this.layout(this.clones, animate);
    },

    toggle: function() {
        if (!this.visible) {
            this.refresh();
        }
        this.actor.visible = !this.actor.visible;
    },

    refresh: function() {
        this.clones = this.createClones(this.space);
        let selectedIndex = this.space.selectedIndex();
        if(selectedIndex > -1) {
            this.restack(selectedIndex);
            this.layout(this.clones, false);
            let frame = this.space.selectedWindow.get_frame_rect();
            this.sync(frame.x, false);
        }
    },

    layout: function(actors, animate = true) {
        function tweenTo(actor, x) {
            // let [dx, dy] = calcOffset(actor.meta_window);
            // actor.set_pivot_point(0, 0);
            let time = 0;
            if (animate) {
                time = 0.25;
            }
            actor.destinationX = x;
            Tweener.addTween(actor, { x: actor.destinationX
                                        , y: 0
                                        , scale_x: 1
                                        , scale_y: 1
                                        , time: time
                                        , transition: "easeInOutQuad"});
        }

        function propagate_forward(i, leftEdge, gap) {
            if(i < 0 || i >= actors.length)
                return;
            let actor = actors[i];
            let w = actor.width;
            let x = leftEdge;

            tweenTo(actor, x);

            propagate_forward(i+1, x + w + gap, gap);
        }

        propagate_forward(0, 0, 5*window_gap);
    },

    reorder: function(index, targetIndex, targetX) {
        // targetX is the destination of the moving window in viewport
        // coordinates

        let movingClone = this.clones[index];

        // Make sure the moving window is on top
        this.minimapActor.set_child_above_sibling(movingClone, this.minimapActor.last_child);

        let temp = this.clones[index];
        this.clones[index] = this.clones[targetIndex];
        this.clones[targetIndex] = temp;

        this.layout(this.clones);

        // this.layout sets destinationX
        this.minimapActor.destinationX = -(movingClone.destinationX - targetX);
        Tweener.addTween(this.minimapActor
                         , { x: this.minimapActor.destinationX 
                             , time: 0.25, transition: 'easeInOutQuad'
                           });

    },

    sync: function(selectedWindowX, animate=true) {
        let time = 0;
        if (animate)
            time = 0.25
        let selectedIndex = this.space.selectedIndex();
        let clone = this.clones[selectedIndex];
        this.minimapActor.destinationX = -(clone.destinationX - selectedWindowX);
        Tweener.addTween(this.minimapActor
                         , { x: this.minimapActor.destinationX
                             , time: time, transition: 'easeInOutQuad' });
    },
})

Signals.addSignalMethods(Minimap.prototype);


MultiMap = new Lang.Class({
    Name: 'MultiMap',

    _init: function(mru) {
        this.actor = new St.Widget({ name: "multimap-viewport" });
        this.container = new St.BoxLayout({ name: "multimap-container" });
        this.actor.add_actor(this.container);
        this.container.set_vertical(true)
        this.container.remove_all_children()
        this.minimaps = [];

        if (mru) {
            this.selectedIndex = 0;
            let seen = {};
            this.addSpace(spaces[global.screen.get_active_workspace_index()], 0)
            seen[global.screen.get_active_workspace()] = true;
            let i = 1;
            global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null)
                .forEach(metaWindow => {
                    let workspace = metaWindow.get_workspace();
                    if (!seen[workspace]) {
                        debug('add workspace');
                        this.addSpace(spaces[workspace.workspace_index], i)
                        seen[workspace] = true;
                        i++;
                    }
                });

            let workspaces = global.screen.get_n_workspaces();
            for (let j=0; j < workspaces; j++) {
                let workspace = global.screen.get_workspace_by_index(j);
                if (!seen[workspace]) {
                    debug('add workspace');
                    this.addSpace(spaces[workspace.workspace_index], i)
                    i++;
                    seen[workspace] = true;
                }
            }
        } else {
            this.selectedIndex = global.screen.get_active_workspace_index();
            spaces.forEach((s, i) => {
                this.addSpace(s, i);
            })
        }
        this.rowHeight = this.container.first_child.height;
        this.actor.height = this.rowHeight;
        this.actor.width = this.container.first_child.width;

        let minimap = this.setSelected(this.selectedIndex, false);

        this.selectionChrome = new St.Widget();
        this.actor.add_child(this.selectionChrome);
        this.selectionChrome.set_style('border: 4px #256ab1; border-radius: 8px');


        let chrome = new St.Widget();
        this.actor.add_child(chrome);
        chrome.set_size(this.actor.width + 2*4, this.actor.height + 2*4);
        chrome.set_position(-4, -4);
        chrome.set_style('border: 4px #454f52; border-radius: 8px;');
    },

    addSpace: function(s, i) {
        let wrapper = new St.Widget({ name: "minimap-wrapper-"+i });
        let minimap = new Minimap(s);

        // Create the background, see overview.js
        let background = new Meta.BackgroundGroup();
        let bgManager = new Background.BackgroundManager({ container: background,
                                                           monitorIndex: 0,
                                                           vignette: false });
        wrapper.add_child(background);
        minimap.actor.reparent(wrapper);
        this.container.add_child(wrapper);
        minimap.actor.visible = true;
        minimap.refresh();
        minimap.fold(undefined, false);
        wrapper.width =
            Math.ceil(minimap.actor.width * minimap.actor.scale_x) + 20;
        wrapper.height =
            Math.ceil(minimap.actor.height * minimap.actor.scale_y) + 12;
        background.first_child.width = wrapper.width;
        background.first_child.height = wrapper.height;
        minimap.actor.set_position(10, 8);
        minimap.connect("item-activated", (unused, i) => {
            this.emit("item-activated", i);
        });
        this.minimaps.push(minimap);
    },

    setSelected: function(i, animate = true) {
        if (i >= this.container.get_children().length ||
            i < 0) {
            return;
        }
        if (i !== this.selectedIndex) {
            this.minimaps[this.selectedIndex].fold(undefined, animate);
        }

        this.selectedIndex = i;
        let time = 0;
        if (animate)
            time = 0.25;
        Tweener.addTween(this.container, { y: -i*this.rowHeight, time: time, transition: 'easeInOutQuad' });
        this.minimaps[this.selectedIndex].unfold(animate);
        return this.minimaps[this.selectedIndex];
    },

    getSelected: function() {
        return this.minimaps[this.selectedIndex];
    },

    onlyShowSelected: function() {
        this.container.get_children().forEach((wrapper, i) => {
            if (i !== this.selectedIndex) {
                wrapper.hide();
            }
        });
        this.container.y = 0;
    },

    showAll: function() {
        this.container.get_children().forEach((wrapper, i) => {
            wrapper.show();
        });
        this.setSelected(this.selectedIndex, false);
    },

    highlight: function(index) {
        let minimap = this.getSelected();
        let clone = minimap.clones[index];
        let size = clone.get_transformed_size()

        // Note that both the minimapActor and the clone could be moving at this
        // point.
        //
        // For some reason Clutter.Actor.apply_relative_transform_to_point
        // fail to work when changing workspace.. (ie. when going from only one
        // minimap visible to all visible)

        /**
         * Transformation a point in `actor`-relative coordinates to `ancestor`
         * relative coordinates. (NB: ignores rotations for now)
         * Uses actor's `destinationX/Y` if set.
         */
        function transform(actor, ancestor, x, y) {
            if (actor === ancestor || !actor)
                return [x, y];

            let actorX = actor.x;
            if (actor.destinationX !== undefined)
                actorX = actor.destinationX;

            let actorY = actor.y;
            if (actor.destinationY !== undefined)
                actorX = actor.destinationY;

            return transform(actor.get_parent(), ancestor,
                             x*actor.scale_x + actorX,
                             y*actor.scale_y + actorY);
        }

        // Calculate destinationX of selected clone in viewport coordinates and
        // tween the chrome there
        let [x, yIgnored] = transform(minimap.minimapActor, this.actor, clone.destinationX, 0)

        Tweener.addTween(this.selectionChrome,
                         {x: x - 4,
                          y: 4,
                          width: size[0] + 8,
                          height: size[1] + 8,
                          time: 0.25,
                          transition: 'easeInOutQuad'
                         })
    }
})

Signals.addSignalMethods(MultiMap.prototype);
