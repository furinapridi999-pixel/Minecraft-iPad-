// ==========================================
// Touch controls
//
// On-screen controls for tablets and phones. Keyboard and mouse
// keep working exactly as before; this file only adds touch input.
//
//   Left half         floating joystick: touch and drag to walk
//   Right half        drag to look around
//   Ломать / Ставить  break / place the block in the crosshair
//                     (hold to repeat)
//   Прыжок            jump (hold to keep jumping)
//   Инв.              open / close the inventory
//   Экран             fullscreen
//
// Add ?touch=1 to the URL to force the controls on a desktop
// browser (handy for testing).
// ==========================================

// isTouchDevice()
//
// True when the page is running on a device with a touch screen.

function isTouchDevice()
{
	return ( "ontouchstart" in window ) ||
		( navigator.maxTouchPoints > 0 ) ||
		/[?&]touch=1/.test( window.location.search );
}

// initTouchControls( player )
//
// Builds the on-screen controls and wires them to the local player.
// Does nothing on devices without touch.

function initTouchControls( player )
{
	if ( !isTouchDevice() || !player ) return null;

	var MOVE_RADIUS = 60;     // max joystick travel in px
	var MOVE_DEAD = 0.3;      // fraction of radius needed to count as a direction
	var LOOK_SENSITIVITY = 1 / 150;
	var MAX_PITCH = Math.PI / 2;

	var root = document.createElement( "div" );
	root.id = "touch-controls";
	root.innerHTML =
		'<div id="tc-move-zone" class="tc-zone tc-play"></div>' +
		'<div id="tc-hint" class="tc-play"></div>' +
		'<div id="tc-stick" class="tc-play"><div id="tc-knob"></div></div>' +
		'<div id="tc-look-zone" class="tc-zone tc-play"></div>' +
		'<button id="tc-break" class="tc-btn tc-play" type="button">Ломать</button>' +
		'<button id="tc-place" class="tc-btn tc-play" type="button">Ставить</button>' +
		'<button id="tc-jump" class="tc-btn tc-play" type="button">Прыжок</button>' +
		'<button id="tc-inv" class="tc-btn" type="button">Инв.</button>' +
		'<button id="tc-full" class="tc-btn" type="button">Экран</button>' +
		'<div id="tc-rotate">Поверните планшет горизонтально</div>';
	document.body.appendChild( root );

	var canvas = player.canvas;
	var moveZone = document.getElementById( "tc-move-zone" );
	var lookZone = document.getElementById( "tc-look-zone" );
	var stick = document.getElementById( "tc-stick" );
	var knob = document.getElementById( "tc-knob" );

	// ---- Helpers --------------------------------------------------

	function setWalkKeys( w, s, a, d )
	{
		player.keys["w"] = w;
		player.keys["s"] = s;
		player.keys["a"] = a;
		player.keys["d"] = d;
	}

	function releaseAll()
	{
		setWalkKeys( false, false, false, false );
		player.keys[" "] = false;
	}

	// Pointer capture keeps the events coming even if the finger
	// slides off the element, which is what we want for joysticks.
	function capture( el, id )
	{
		try { el.setPointerCapture( id ); } catch ( err ) {}
	}

	// ---- Joystick (walking) ---------------------------------------

	var moveId = null;
	var moveStartX = 0;
	var moveStartY = 0;

	moveZone.addEventListener( "pointerdown", function ( e ) {
		if ( moveId !== null ) return;
		moveId = e.pointerId;
		moveStartX = e.clientX;
		moveStartY = e.clientY;
		capture( moveZone, e.pointerId );

		stick.style.left = e.clientX + "px";
		stick.style.top = e.clientY + "px";
		stick.classList.add( "tc-active" );
		knob.style.transform = "translate(0px, 0px)";
		e.preventDefault();
	} );

	moveZone.addEventListener( "pointermove", function ( e ) {
		if ( e.pointerId !== moveId ) return;
		var dx = e.clientX - moveStartX;
		var dy = e.clientY - moveStartY;
		var len = Math.sqrt( dx * dx + dy * dy );
		if ( len > MOVE_RADIUS ) {
			dx *= MOVE_RADIUS / len;
			dy *= MOVE_RADIUS / len;
		}
		knob.style.transform = "translate(" + dx + "px, " + dy + "px)";

		var nx = dx / MOVE_RADIUS;
		var ny = dy / MOVE_RADIUS;
		setWalkKeys(
			ny < -MOVE_DEAD,   // w: forward
			ny >  MOVE_DEAD,   // s: backward
			nx < -MOVE_DEAD,   // a: left
			nx >  MOVE_DEAD    // d: right
		);
	} );

	function endMove( e ) {
		if ( e.pointerId !== moveId ) return;
		moveId = null;
		stick.classList.remove( "tc-active" );
		setWalkKeys( false, false, false, false );
	}
	moveZone.addEventListener( "pointerup", endMove );
	moveZone.addEventListener( "pointercancel", endMove );
	moveZone.addEventListener( "lostpointercapture", endMove );

	// ---- Look (drag on the right half) ----------------------------

	var lookId = null;
	var lookX = 0;
	var lookY = 0;

	lookZone.addEventListener( "pointerdown", function ( e ) {
		if ( lookId !== null ) return;
		lookId = e.pointerId;
		lookX = e.clientX;
		lookY = e.clientY;
		capture( lookZone, e.pointerId );
		e.preventDefault();
	} );

	lookZone.addEventListener( "pointermove", function ( e ) {
		if ( e.pointerId !== lookId ) return;
		var dx = e.clientX - lookX;
		var dy = e.clientY - lookY;
		lookX = e.clientX;
		lookY = e.clientY;

		// Same mapping as the mouse in player.js, so the camera feels the same.
		player.yawStart += dx * LOOK_SENSITIVITY;
		player.pitchStart -= dy * LOOK_SENSITIVITY;
		if ( player.pitchStart > MAX_PITCH ) player.pitchStart = MAX_PITCH;
		if ( player.pitchStart < -MAX_PITCH ) player.pitchStart = -MAX_PITCH;
		player.targetYaw = player.yawStart;
		player.targetPitch = player.pitchStart;
	} );

	function endLook( e ) {
		if ( e.pointerId !== lookId ) return;
		lookId = null;
	}
	lookZone.addEventListener( "pointerup", endLook );
	lookZone.addEventListener( "pointercancel", endLook );
	lookZone.addEventListener( "lostpointercapture", endLook );

	// ---- Buttons --------------------------------------------------

	// Calls onPress once on touch, then again every `interval` ms while held.
	function holdButton( el, onPress, onRelease, interval )
	{
		var id = null;
		var timer = null;

		function stop( e ) {
			if ( e && e.pointerId !== id ) return;
			id = null;
			clearInterval( timer );
			timer = null;
			el.classList.remove( "tc-pressed" );
			if ( onRelease ) onRelease();
		}

		el.addEventListener( "pointerdown", function ( e ) {
			if ( id !== null ) return;
			id = e.pointerId;
			capture( el, id );
			el.classList.add( "tc-pressed" );
			onPress();
			if ( interval ) timer = setInterval( onPress, interval );
			e.preventDefault();
		} );
		el.addEventListener( "pointerup", stop );
		el.addEventListener( "pointercancel", stop );
		el.addEventListener( "lostpointercapture", stop );
	}

	// Break / place act on the block in the centre of the screen,
	// exactly like a mouse click in player.js.
	function blockAction( destroy )
	{
		player.doBlockAction( canvas.width / 2, canvas.height / 2, destroy );
	}

	holdButton(
		document.getElementById( "tc-break" ),
		function () { blockAction( true ); },
		null,
		250
	);

	holdButton(
		document.getElementById( "tc-place" ),
		function () { blockAction( false ); },
		null,
		250
	);

	holdButton(
		document.getElementById( "tc-jump" ),
		function () { player.keys[" "] = true; },
		function () { player.keys[" "] = false; },
		0
	);

	document.getElementById( "tc-inv" ).addEventListener( "click", function () {
		player.openInventory();
	} );

	document.getElementById( "tc-full" ).addEventListener( "click", function () {
		var el = document.documentElement;
		var fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
		try {
			if ( !fullscreen ) {
				var request = el.requestFullscreen || el.webkitRequestFullscreen;
				if ( request ) {
					var p = request.call( el );
					if ( p && p.catch ) p.catch( function () {} );
				}
				// Locking orientation only works in fullscreen, and only on some browsers.
				if ( screen.orientation && screen.orientation.lock ) {
					screen.orientation.lock( "landscape" ).catch( function () {} );
				}
			} else {
				var exit = document.exitFullscreen || document.webkitExitFullscreen;
				if ( exit ) exit.call( document );
			}
		} catch ( err ) {
			// Fullscreen is optional; ignore if the browser refuses it.
		}
	} );

	// ---- Keep the controls in sync with the game ------------------

	// While the inventory is open the game UI takes over the screen:
	// hide the game controls, keep the Инв. button so it can be closed.
	var wasInGui = false;
	function sync() {
		var inGui = !!player.onGui;
		root.classList.toggle( "tc-gui", inGui );
		if ( inGui && !wasInGui ) releaseAll();
		wasInGui = inGui;
		requestAnimationFrame( sync );
	}
	sync();

	// If the page loses focus mid-touch, don't leave keys stuck down.
	window.addEventListener( "blur", releaseAll );

	return root;
}
