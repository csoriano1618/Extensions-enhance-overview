/*imports from workspace to edit its functions*/
const Shell = imports.gi.Shell;

const Dash=imports.ui.dash;
const DashItemContainer=imports.ui.dash.DashItemContainer;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;

/*imports of workspace and its data*/
const Workspace = imports.ui.workspace;
const WindowPositionFlags = Workspace.WindowPositionFlags;

const ExtensionUtils = imports.misc.extensionUtils;

/*Some general imports*/
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const Lang = imports.lang;
const Meta = imports.gi.Meta;

const St = imports.gi.St;
const Mainloop = imports.mainloop;

/*Import needed by dash*/
const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;

const DASH_ANIMATION_TIME = 0.2;
const DASH_ITEM_LABEL_SHOW_TIME = 0.15;
const DASH_ITEM_LABEL_HIDE_TIME = 0.1;
const DASH_ITEM_HOVER_TIMEOUT = 300;
const DASH_CHANGING_BETWEEN_HOVER_APP=100;
///

function _showWindowsOfHoverApplication(app, item)
{
	let allAppMetaWindows=app.get_windows();
	let overlayWindowsHoverApp= [];
	let overlayWindowsNotHoverApp=[];
	for each(appMetaWindow in allAppMetaWindows)
	{
		let index=this._lookupIndex(appMetaWindow);
		if(index>=0)
		{
			//Same index to metaWindows and overlayWindows
			overlayWindowsHoverApp.push(this._windowOverlays[index]);
		}
	}
	//If we are in a workspace that this app has not windows, we skip all the procces
	if(overlayWindowsHoverApp.length==0)
	{
		return;
	}
	//We separate the overlay widnows that are not from the hover app
	for each(overlayWindow in this._windowOverlays)
	{
		if(overlayWindowsHoverApp.indexOf(overlayWindow)<0)
		{
			overlayWindowsNotHoverApp.push(overlayWindow);
		}
	}

	/*Now separate in two cases.
	 * 1- When it's the first time that we hover an app in the dash. In this mode, we wait some time
	 * to ensure that the user wants to show one application in the overview.
	 * 2- We pass to this state when we hover another diferent application in the dash. In this case
	 * we have to wait some little time, to ensure that the user are not going quickly over the dash
	 * to get a specific application. Each time we erase the "leave" event, to preventing to reorder
	 * all windows like if we doesn't hover any application in the dash.
	 * When the user stop in some application in the dash we pass from the last windows from the old hover app
	 * to the new windows of the new hover app.
	 */
	let [x, y, mask] = global.get_pointer();
	let actorUnderPointer = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

	//Delay some time to enter in showing one application mode
	if(item.actor.get_children()[0] == actorUnderPointer && this._currentHoverAppItem==undefined)
	{
		/*If we hover one app, the hover time not exceeded, and we hover another app,
		 *we erase the timeout from the previous hover app.
		 */	
		if(this._timeOutShowOneWindowAppId>0)
		{
			Mainloop.source_remove(this._timeOutShowOneWindowAppId);
			this._timeOutShowOneWindowAppId=0;
		}
		/*If we went from a hover app in dash without exceeded timeout, sure that we have a "on leave" event,
		 *trying to repositioning all the windows in a normal mode, so we have to 
		 *erase this event, because we don't want to reposition all windows in normal mode
		 *now
		 */
		if(this._repositionWindowsId>0)
		{
			Mainloop.source_remove(this._repositionWindowsId);
			this._repositionWindowsId=0;
		}
		/*There we add some timeout to Mainloop of GTK to prevent changing windows
		 * like a crazy
		 */

		this._timeOutShowOneWindowAppId=Mainloop.timeout_add(DASH_ITEM_HOVER_TIMEOUT,
				Lang.bind(this, function () {this._delayedWindowRepositioningOneApplication
					(overlayWindowsHoverApp, overlayWindowsNotHoverApp, item)}));
	}

	//From showing one application mode to another one application mode
	else if(item.actor.get_children()[0] == actorUnderPointer && this._currentHoverAppItem !== item)
	{
		/*If we went from a hover app in dash, sure that we have a "on leave" event,
		 *trying to repositioning all the windows in a normal mode, so we have to 
		 *erase this event, because we don't want to reposition all windows in normal mode
		 *now
		 */
		if(this._repositionWindowsId>0)
		{
			Mainloop.source_remove(this._repositionWindowsId);
			this._repositionWindowsId=0;
		}
		/*If we went from a hovered app and showing his windows, hover diferent app, the hover time to change 
		 * to another app showing his windows not exceeded, and hover another diferent app, we erase the timeout
		 *  from the previous hover app.
		 */		
		if(this._timeOutChangingBetweenAppsId>0)
		{
			Mainloop.source_remove(this._timeOutChangingBetweenAppsId);
			this._timeOutChangingBetweenAppsId=0;
		}
		//Add some timeout to changing between apps after we enter in the one appliction mode
		this._timeOutShowOneWindowAppId = Mainloop.timeout_add(DASH_CHANGING_BETWEEN_HOVER_APP,
				Lang.bind(this, function () {this._delayedWindowRepositioningOneApplication
					(overlayWindowsHoverApp, overlayWindowsNotHoverApp, item)}));
	}
	else
	{
		//Not handle, probably we hover one app, unhover and hover again in less than 750 ms;
	}


}

function _dashItemOnHover(item, display)
{
	let appHoverDash=display.app;
	let index=global.screen.get_active_workspace_index();
	//TODO: with all monitors, currently only with one monitor (I need two monitors to test it)
	let currentMonitor = Main.layoutManager.primaryIndex;
	let currentWorkspace=Main.overview._workspacesDisplay._workspaces[currentMonitor][index];
	currentWorkspace.showWindowsOfHoverApplication(appHoverDash, item);
}

function _dashItemOnLeave(item, display)
{
	let index=global.screen.get_active_workspace_index();

	//TODO: Now we are showing only in the primary monitor, but we have to show in all monitors

	let currentMonitor = Main.layoutManager.primaryIndex;
	let currentWorkspace=Main.overview._workspacesDisplay._workspaces[currentMonitor][index];
	let workspaceView=Main.overview._workspacesDisplay._workspacesViews[index];

	//Repositioning wndows delayed
	if (currentWorkspace._repositionWindowsId > 0)
	{
		Mainloop.source_remove(currentWorkspace._repositionWindowsId);
		currentWorkspace._repositionWindowsId = 0;
	}

	// setup new handler
	let [x, y, mask] = global.get_pointer();
	currentWorkspace._cursorX = x;
	currentWorkspace._cursorY = y;
	currentWorkspace._leavingOneApplicationMode=true;
	currentWorkspace._repositionWindowsId = Mainloop.timeout_add(750,
			function(){
		return currentWorkspace._delayedWindowRepositioning()});
}

function _delayedWindowRepositioningOneApplication (overlayWindowsHoverApp, overlayWindowsNotHoverApp, item)
{

	/*Now separate in two cases.
	 * 1- When we already wait some time, we pass to the showingOneApplication mode, where
	 * we show only one application windows, the application that is hovered in the dash.
	 * 2- We pass to this state when we hover another diferent application in the dash. In this case
	 * we have to wait some little time, to ensure that the user are not going quickly over the dash
	 * to get a specific application. Each time we erase the "leave" event, to preventing to reorder
	 * all windows like if we doesn't hover any application in the dash.
	 * When the user stop in some application in the dash we pass from the last windows from the old hover app
	 * to the new windows of the new hover app.
	 */
	let [x, y, mask] = global.get_pointer();
	let actorUnderPointer = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
	//First case
	if (item.actor.get_children()[0] == actorUnderPointer  && this._currentHoverAppItem==undefined)
	{
		this._leavingOneApplicationMode=false;
		this._showOneApplicationMode=true;
		this._showingOneApplicationOverlayWindows=overlayWindowsHoverApp;
		this._currentHoverAppItem=item;
		this.positionWindows(WindowPositionFlags.ANIMATE, overlayWindowsHoverApp, overlayWindowsNotHoverApp);
		return false;
	}
	//Second case
	else if(item.actor.get_children()[0] == actorUnderPointer  && this._currentHoverAppItem && this._currentHoverAppItem !== item)
	{
		this._leavingOneApplicationMode=false;
		//First, caculate the position of the next hover app windows
		this.positionWindows (WindowPositionFlags.INITIAL, overlayWindowsHoverApp, overlayWindowsNotHoverApp);
		//Now, morph between old windows to new windows
		//For each old window, morph to opacity 0
		for each(overlayWindowOldHoverApp in this._showingOneApplicationOverlayWindows)
		{

			Tweener.addTween(overlayWindowOldHoverApp._windowClone.actor,
					{ opacity: 0,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
				onComplete: function(){
					overlayWindowOldHoverApp.hideOverlayAndWindow();
				}
					});

			Tweener.addTween(overlayWindowOldHoverApp.title,
					{
				opacity: 0,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
				onComplete:function()
				{
					overlayWindowOldHoverApp.hideOverlayAndWindow();
				}
					});
		}
		//show new windows
		for each(overlayWindowNewHoverApp in overlayWindowsHoverApp)
		{
			overlayWindowNewHoverApp.showOverlayAndWindow()
			Tweener.addTween(overlayWindowNewHoverApp._windowClone.actor,
					{ opacity: 255,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
					});

			Tweener.addTween(overlayWindowNewHoverApp.title,
					{
				opacity: 255,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
					});
		}
		this._currentHoverAppItem=item;
		this._showingOneApplicationOverlayWindows=overlayWindowsHoverApp;
		this.positionWindows (WindowPositionFlags.INITIAL, undefined, overlayWindowsNotHoverApp, true)
		return false;
	}
	return false;
}

function _createAppItem(app)
{
	let display = new AppDisplay.AppWellIcon(app,
			{ setSizeManually: true,
		showLabel: false });
	display._draggable.connect('drag-begin',
			Lang.bind(this, function() {
				display.actor.opacity = 50;
			}));
	display._draggable.connect('drag-end',
			Lang.bind(this, function() {
				display.actor.opacity = 255;
			}));

	let item = new DashItemContainer();
	item.setChild(display.actor);

	item.setLabelText(app.get_name());
//	Override default AppWellIcon label_actor
	display.actor.label_actor = item.label;


	display.icon.setIconSize(this.iconSize);
	//I added this function, to know when the icon from dash
	//is unhovered
	display.actor.connect('enter-event',
			Lang.bind(this, function() {
				this._onHover(item, display)
			}));
	display.actor.connect('leave-event',
			Lang.bind(this, function() {
				this._onLeave(item, display)
			}));
	return item;
}

function _hideOverlayAndWindow()
{
	this._hidden = true;
	this._windowClone.actor.hide()
	this.closeButton.hide();
	this.title.hide();	
}

function _showOverlayAndWindow()
{
	this._hidden = false;
	this._windowClone.actor.show()
	if (this._windowClone.actor.has_pointer)
		this.closeButton.show();
	this.title.show();
}

function _positionWindows(flags, overlayWindowsToPositionShowing, overlayWindowsToPositionNotShowing)
{
	//Prevent previous delayed positionWindows
	if (this._repositionWindowsId > 0)
	{
		Mainloop.source_remove(this._repositionWindowsId);
		this._repositionWindowsId = 0;
	}

	let clonesToShow=[];
	let clonesToNotShow=[];
	let clonesAll=[]

	//Normal positioning, all the windows
	if(overlayWindowsToPositionShowing== undefined && overlayWindowsToPositionNotShowing==undefined)
	{
		clonesToShow=this._windows.slice();
	}
	else
		//Specific windows to reposition
	{
		if(overlayWindowsToPositionShowing)
		{
			for each(overlayWindowToPositionShowing in overlayWindowsToPositionShowing)
			{
				clonesToShow.push(overlayWindowToPositionShowing._windowClone);
				clonesAll.push(overlayWindowToPositionShowing._windowClone)
			}
		}
		if(overlayWindowsToPositionNotShowing)
		{
			for each(overlayWindowToPositionNotShowing in overlayWindowsToPositionNotShowing)
			{
				clonesToNotShow.push(overlayWindowToPositionNotShowing._windowClone);
				clonesAll.push(overlayWindowToPositionNotShowing._windowClone);
			}
		}
	}
	//If we have to reserve some slot (while draging)
	if (this._reservedSlot)
	{
		clonesToShow.push(this._reservedSlot);
	}

	//We have to animate the repositioning?

	let initialPositioning = flags & WindowPositionFlags.INITIAL;
	let animate = flags & WindowPositionFlags.ANIMATE;

	// Start the animations
	let slotsToShow = this._computeAllWindowSlots(clonesToShow.length);
	clonesToShow = this._orderWindowsByMotionAndStartup(clonesToShow, slotsToShow);

	/*
	 * We take all the windows, because we want to reserve
	 * space for the windows showing. It's more beautiful in animations
	 */
	let slotsAll = this._computeAllWindowSlots(clonesAll.length);
	clonesAll = this._orderWindowsByMotionAndStartup(clonesAll, slotsAll);

	let currentWorkspace = global.screen.get_active_workspace();
	let isOnCurrentWorkspace = this.metaWorkspace == null || this.metaWorkspace == currentWorkspace;
	/*
	 * If we have some windows to show, we reorder an show them.
	 * Three cases:
	 * 1-specific windows to show(we reorder  both windows to show and windows to not show)
	 * 2-No specific windows to show, but some windows to not shown (We only
	 * reposition windows to not show)
	 * 3-Not specific windows to show and not specific windows to not show either
	 * (we repositon windows in this._windows, so all windows, and show them)
	 */
	if(clonesToShow)
	{
		for (let i = 0; i < clonesToShow.length; i++)
		{
			let slot = slotsToShow[i];
			let clone = clonesToShow[i];
			let metaWindow = clone.metaWindow;
			let mainIndex = this._lookupIndex(metaWindow);
			let overlay = this._windowOverlays[mainIndex];

			// Positioning a window currently being dragged must be avoided;
			// we'll just leave a blank spot in the layout for it.
			if (clone.inDrag)
			{
				continue;
			}

			let [x, y, scale] = this._computeWindowLayout(metaWindow, slot);

			if (overlay && initialPositioning)
			{
				overlay.hide();
			}

			if (animate && isOnCurrentWorkspace)
			{
				if (!metaWindow.showing_on_its_workspace())
				{
					/* Hidden windows should fade in and grow
					 * therefore we need to resize them now so they
					 * can be scaled up later */
					if (initialPositioning)
					{
						clone.actor.opacity = 0;
						clone.actor.scale_x = 0;
						clone.actor.scale_y = 0;
						clone.actor.x = x;
						clone.actor.y = y;
					}

					// Make the window slightly transparent to indicate it's hidden
					Tweener.addTween(clone.actor,
							{ opacity: 255,
						time: Overview.ANIMATION_TIME,
						transition: 'easeInQuad'
							});
				}
				this._animateClone(clone, overlay, x, y, scale, initialPositioning, this._leavingOneApplicationMode);
			}
			else
			{
				clone.actor.set_position(x, y);
				clone.actor.set_scale(scale, scale);
				this._updateWindowOverlayPositions(clone, overlay, x, y, scale, false);
				this._showWindowOverlay(clone, overlay, isOnCurrentWorkspace);
			}
		}
	}

	if(overlayWindowsToPositionNotShowing)
	{

		for (let i = 0; i < clonesAll.length; i++)
		{
			let slot = slotsAll[i];
			let clone = clonesAll[i];
			let metaWindow = clone.metaWindow;
			let mainIndex = this._lookupIndex(metaWindow);
			let overlay = this._windowOverlays[mainIndex];

			//if this windows is not a to hide window, we skip it
			if (overlayWindowsToPositionNotShowing.indexOf(overlay)<0)
			{
				continue;
			}

			// Positioning a window currently being dragged must be avoided;
			// we'll just leave a blank spot in the layout for it.
			if (clone.inDrag)
			{
				continue;
			}

			let [x, y, scale] = this._computeWindowLayout(metaWindow, slot);

			//If it is already hidden, dont animate
			if(overlay._hiden)
			{
				clone.actor.set_position(x, y);
				clone.actor.set_scale(scale, scale);
				this._updateWindowOverlayPositions(clone, overlay, x, y, scale, false);
				continue;
			}

			Tweener.addTween(overlay._windowClone.actor,
					{ opacity: 0,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
				onComplete: Lang.bind(this, function()
						{
					overlay.hideOverlayAndWindow();
					clone.actor.set_position(x, y);
					clone.actor.set_scale(scale, scale);
					this._updateWindowOverlayPositions(clone, overlay, x, y, scale, false);
						}
				)});

			Tweener.addTween(overlay.title,
					{
				opacity: 0,
				time: Overview.ANIMATION_TIME,
				transition: 'easeOutQuad',
				onComplete:function()
				{
					overlay.hideOverlayAndWindow();
				}
					});
		}
	}

	if(this._leavingOneApplicationMode)
	{
		global.log("Leaving one applciation mode");
		if(this._timeOutShowOneWindowAppId>0)
		{
			Mainloop.source_remove(this._timeOutShowOneWindowAppId);
			this._timeOutShowOneWindowAppId=0;
		}
		if(this._timeOutChangingBetweenAppsId>0)
		{
			Mainloop.source_remove(this._timeOutChangingBetweenAppsId);
			this._timeOutChangingBetweenAppsId=0;
		}
		this._showOneApplicationMode=false;
		this._leavingOneApplicationMode=false;
		this._showingOneApplicationOverlayWindows=[];
		this._currentHoverAppItem=undefined;
		global.log("Fisnih leaving one applciation mode");
	}
}

function _animateClone(clone, overlay, x, y, scale, initialPositioning, fromOneApplicationMode)
{
	/*we add this to show also the window clone that is suposed to be hidden(opacity 0)*/
	if(fromOneApplicationMode)
	{
		overlay.showOverlayAndWindow();
		Tweener.addTween(overlay._windowClone.actor,
				{ opacity: 255,
			time: Overview.ANIMATION_TIME,
			transition: 'easeOutQuad',
				});

		Tweener.addTween(overlay.title,
				{
			opacity: 255,
			time: Overview.ANIMATION_TIME,
			transition: 'easeOutQuad',
				});
	}
	Tweener.addTween(clone.actor,
			{ x: x,
		y: y,
		scale_x: scale,
		scale_y: scale,
		time: Overview.ANIMATION_TIME,
		transition: 'easeOutQuad',
		onComplete: Lang.bind(this, function() {
			this._showWindowOverlay(clone, overlay, true);
		})
			});

	this._updateWindowOverlayPositions(clone, overlay, x, y, scale, true);
}

function _initWorkspace()
{
	this._timeOutShowOneWindowAppId=0;
	this._timeOutChangingBetweenAppsId=0;
	this._leavingOneApplicationMode=false;
	this._showOneApplicationMode=false;
	this._showingOneApplicationOverlayWindows=[];
	this._currentHoverAppItem=undefined;
}

function dragEnd()
{
	/*Silly workaround to reorder windows after drag. It has
	 * to be fixed in a good way, not like this.
	 */
	let currentMonitor = Main.layoutManager.primaryIndex;
	let index=global.screen.get_active_workspace_index();
	let currentWorkspace=Main.overview._workspacesDisplay._workspaces[currentMonitor][index];

	currentWorkspace.positionWindows(WindowPositionFlags.ANIMATE);
}


//--------------------------------------------------------------------//
let dashInjections;
let workspaceInjections;
let winOverlayInjections;

function injectToFunction(parent, name, func)
{
	let origin = parent[name];
	parent[name] = function()
	{
		let ret;
		ret = origin.apply(this, arguments);
		if (ret === undefined)
			ret = func.apply(this, arguments);
		return ret;
	}
	return origin;
}

function removeInjection(object, injection, name)
{
	if (injection[name] === undefined)
		delete object[name];
	else
		object[name] = injection[name];
}

function resetState() 
{
	dashInjections={};
	workspaceInjections={};
	winOverlayInjections={};
}

function init()
{
	/* do nothing */
}

function enable()
{
	resetState();

	dashInjections['_onHover'] = injectToFunction(Dash.Dash.prototype, '_onHover',  _dashItemOnHover);
	dashInjections['_createAppItem'] = Dash.Dash.prototype['_createAppItem'];
	Dash.Dash.prototype['_createAppItem'] = _createAppItem ;
	dashInjections['_onLeave'] = undefined;
	Dash.Dash.prototype['_onLeave'] = _dashItemOnLeave;

	Workspace.WindowOverlay.prototype['hideOverlayAndWindow'] = _hideOverlayAndWindow;
	Workspace.WindowOverlay.prototype['showOverlayAndWindow'] = _showOverlayAndWindow;

	workspaceInjections['_init']=injectToFunction(Workspace.Workspace.prototype, '_init',  _initWorkspace);
	workspaceInjections['positionWindows'] = Workspace.Workspace.prototype['positionWindows'];
	Workspace.Workspace.prototype['positionWindows'] = _positionWindows;
	workspaceInjections['showWindowsOfHoverApplication'] = undefined;
	Workspace.Workspace.prototype['showWindowsOfHoverApplication']=_showWindowsOfHoverApplication;
	workspaceInjections['_delayedWindowRepositioningOneApplication'] = undefined;
	Workspace.Workspace.prototype['_delayedWindowRepositioningOneApplication'] = _delayedWindowRepositioningOneApplication;
	workspaceInjections['_animateClone'] = Workspace.Workspace.prototype['_animateClone'];
	Workspace.Workspace.prototype['_animateClone'] = _animateClone;

	Main.overview.connect('window-drag-end', dragEnd);
}

function disable()
{
	for (i in workspaceInjections)
	{
		removeInjection(Workspace.Workspace.prototype, workspaceInjections, i);
	}
	for (i in winOverlayInjections)
	{
		removeInjection(Workspace.WindowOverlay.prototype, winOverlayInjections, i);
	}
	for (i in dashInjections)
	{
		removeInjection(Dash.Dash.prototype, dashInjections, i);
	}

	//Main.overview.disconnect('window-drag-end', dragEnd);

	resetState();

}
