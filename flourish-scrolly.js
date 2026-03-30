function initStories() {
	var stories = document.querySelectorAll(".flourish-embed");
	// TODO Ignore non-story embeds
	for (var i = 0; i < stories.length; i++) {
		var story = stories[i],
		    id = story.dataset.src.split("/")[1],
		    h = story.getAttribute("data-height") || "75vh",
		    last_link = last_link_per_story["story-" + id],
		    common_parent = commonAncestor(story, last_link);

		story.id = "story-" + id;

		var target_div = document.createElement("div");
		target_div.classList.add("fl-scrolly-section");
		target_div.style.position = "relative";
		target_div.style.paddingBottom = "1px";
		target_div.id = "fl-scrolly-section-" + id;
		target_div.dataset.storyId = id;
		target_div.dataset.storyIndex = i;
		story_index_by_id[id] = i;

		common_parent.classList.add("fl-scrolly-parent-" + id);

		var children = document.querySelectorAll(".fl-scrolly-parent-" + id + " > *");
		story.__found_story__ = false;
		for (var j = 0; j < children.length; j++) {
			var child = children[j];
			if (story.__found_story__) {
				target_div.appendChild(child);
				if (child.querySelector(".fl-scrolly-last-link-story-" + id)) break;
			}
			else {
				var embed = child.id == "story-" + id || child.querySelector("#story-" + id);
				if (embed) {
					story.__found_story__ = true;
					child.style.setProperty("--fl-scrolly-height", h);
					child.classList.add("fl-scrolly-sticky");
					child.dataset.storyId = id;
					child.dataset.storyIndex = i;
					common_parent.insertBefore(target_div, child);
					target_div.appendChild(child);
				}
			}
		}
	}
}

var last_link_per_story = {};
var story_index_by_id = {};
var active_story_id = null;
var active_story_index = -1;
var active_step = null;
var map_overlay = null;
var map_overlay_root = null;
var map_overlay_caption = null;
var map_overlay_notice = null;
var map_overlay_map = null;
var map_is_ready = false;
var pending_map_state = null;
var active_map_style = "";
var map_camera_sequence = 0;
var map_rotate_animation_frame = null;
var map_icon_opacity_cache = {};

function getTriggerStep(el) {
	return el && el.tagName === "A" ? el.parentNode : el;
}

function parseTriggerInfo(el) {
	if (!el) return null;

	var href = el.getAttribute && el.getAttribute("href");
	if (href) {
		var match = href.match(/#story\/(\d+)\/slide-(\d+)/);
		if (match) {
			return {
				storyId: match[1],
				slideNumber: parseFloat(match[2])
			};
		}
	}

	var story_id = el.dataset ? el.dataset.storyId : null;
	var slide_number = el.dataset ? parseFloat(el.dataset.slide) : null;
	if (!story_id || !Number.isFinite(slide_number)) return null;

	return {
		storyId: story_id,
		slideNumber: slide_number
	};
}

function getScrollyTriggers() {
	return document.querySelectorAll("a[href*='#story/'], [data-story-id][data-slide]");
}

function initLinks() {
	var triggers = getScrollyTriggers();
	for (var i = 0; i < triggers.length; i++) {
		var trigger = triggers[i];
		var trigger_info = parseTriggerInfo(trigger);
		if (!trigger_info) continue;

		var step = getTriggerStep(trigger);
		var id = trigger_info.storyId;
		last_link_per_story["story-" + id] = step;
		trigger.classList.add("fl-scrolly-link");
		trigger.classList.add("story-" + id);
		step.classList.add("fl-scrolly-step");

		trigger.addEventListener("click", function(e) {
			if (this.tagName === "A") e.preventDefault();
			setActiveStep(getTriggerStep(this));
			updateStoryFromTrigger(this);
		});
	}
	for (var link in last_link_per_story) {
		last_link_per_story[link].classList.add("fl-scrolly-last-link-" + link);
	}
}

function initIntersection() {
	var observer = new IntersectionObserver(function(entries, observer) {
		entries.forEach(function(entry) {
			if (entry.isIntersecting) {
				setActiveStep(getTriggerStep(entry.target));
				updateStoryFromTrigger(entry.target);
			}
		});
	}, { rootMargin: "0px 0px -50% 0px" });
	getScrollyTriggers().forEach(function(trigger) {
		return observer.observe(trigger);
	});
}

function setActiveStep(step) {
	if (!step || step === active_step) return;
	active_step = step;
	document.querySelectorAll(".fl-scrolly-step").forEach(function(item) {
		item.classList.toggle("fl-scrolly-step-active", item === step);
	});
}

function setActiveStory(id) {
	if (!id || id === active_story_id) return;
	var next_index = story_index_by_id[id];
	active_story_id = id;
	active_story_index = next_index;
	document.querySelectorAll(".fl-scrolly-sticky").forEach(function(sticky) {
		var is_active = sticky.dataset.storyId === id;
		var sticky_index = parseInt(sticky.dataset.storyIndex, 10);
		var shift_x = sticky_index < next_index ? -72 : 72;
		sticky.style.setProperty("--fl-scrolly-shift-x", shift_x + "px");
		sticky.classList.toggle("fl-scrolly-active", is_active);
		sticky.classList.toggle("fl-scrolly-inactive", !is_active);
	});
	document.querySelectorAll(".fl-scrolly-section").forEach(function(section) {
		var is_active = section.dataset.storyId === id;
		section.classList.toggle("fl-scrolly-section-active", is_active);
		section.querySelectorAll(".fl-scrolly-step").forEach(function(step, index) {
			step.style.setProperty("--fl-step-delay", Math.min(index * 70, 280) + "ms");
			step.classList.toggle("fl-scrolly-step-visible", is_active);
			step.classList.toggle("fl-scrolly-step-muted", !is_active);
		});
	});
}

function initStepTransitions() {
	document.querySelectorAll(".fl-scrolly-section").forEach(function(section) {
		section.querySelectorAll(".fl-scrolly-step").forEach(function(step, index) {
			step.dataset.stepIndex = index;
			step.style.setProperty("--fl-step-delay", Math.min(index * 70, 280) + "ms");
		});
	});
}

function initStoryTransitions() {
	var sections = document.querySelectorAll(".fl-scrolly-section");
	if (!sections.length) return;

	var observer = new IntersectionObserver(function(entries) {
		var next_section = null;
		entries.forEach(function(entry) {
			if (entry.isIntersecting) {
				if (!next_section || entry.intersectionRatio > next_section.intersectionRatio) {
					next_section = entry;
				}
			}
		});
		if (next_section) setActiveStory(next_section.target.dataset.storyId);
	}, {
		threshold: [0.2, 0.4, 0.6],
		rootMargin: "-15% 0px -35% 0px"
	});

	sections.forEach(function(section) {
		observer.observe(section);
	});

	setActiveStory(sections[0].dataset.storyId);
}

function updateStoryFromTrigger(el) {
	var trigger_info = parseTriggerInfo(el);
	if (!trigger_info) return;

	var slide_id = trigger_info.slideNumber - 1;
	var step = getTriggerStep(el);
	var section = step.closest(".fl-scrolly-section");
	var iframe = section ? section.querySelector(".flourish-embed iframe") : null;

	setActiveStory(trigger_info.storyId);
	updateMapboxOverlay(el, trigger_info);
	if (!iframe) return;
	iframe.src = iframe.src.replace(/#slide-.*/, "") + "#slide-" + slide_id;
}

function parseMapValue(value) {
	var parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function getMapboxToken() {
	if (window.FL_SCROLLY_MAPBOX_TOKEN) return window.FL_SCROLLY_MAPBOX_TOKEN;
	if (document.body && document.body.dataset.mapboxToken) return document.body.dataset.mapboxToken;
	var token_meta = document.querySelector('meta[name="mapbox-token"]');
	if (token_meta) return token_meta.getAttribute("content");
	return "";
}

function parseBooleanValue(value) {
	if (typeof value !== "string") return false;
	var normalized = value.toLowerCase();
	return normalized === "true" || normalized === "1" || normalized === "yes";
}

function stopContinuousRotation() {
	if (map_rotate_animation_frame !== null) {
		cancelAnimationFrame(map_rotate_animation_frame);
		map_rotate_animation_frame = null;
	}
}

function getStepConfig(story_id, slide_number) {
	var config = window.FL_SCROLLY_STEP_CONFIG || window.flScrollyStepConfig;
	if (!config || !story_id || !Number.isFinite(slide_number)) return null;

	var story_key = String(story_id);
	var slide_key = String(slide_number);

	if (config[story_key] && config[story_key][slide_key]) return config[story_key][slide_key];
	if (config[story_key + ":" + slide_key]) return config[story_key + ":" + slide_key];
	if (config[story_key + "-" + slide_key]) return config[story_key + "-" + slide_key];

	return null;
}

function getMapSetting(el, trigger_info, dataset_key, config_key) {
	if (el && el.dataset && el.dataset[dataset_key] !== undefined) return el.dataset[dataset_key];
	var config = getStepConfig(trigger_info.storyId, trigger_info.slideNumber);
	if (config && config[config_key] !== undefined && config[config_key] !== null) return config[config_key];
	return null;
}

function startContinuousRotation(sequence, state) {
	stopContinuousRotation();
	var last_frame_time = null;
	var direction = state.rotateDirection === "ccw" ? -1 : 1;

	var tick = function(timestamp) {
		if (sequence !== map_camera_sequence || !map_overlay_map) {
			stopContinuousRotation();
			return;
		}

		if (last_frame_time === null) {
			last_frame_time = timestamp;
		}
		var elapsed_seconds = (timestamp - last_frame_time) / 1000;
		last_frame_time = timestamp;

		var next_bearing = map_overlay_map.getBearing() + (state.rotateSpeed * direction * elapsed_seconds);
		map_overlay_map.setBearing(next_bearing);
		map_rotate_animation_frame = requestAnimationFrame(tick);
	};

	map_rotate_animation_frame = requestAnimationFrame(tick);
}

function parseMapState(link, trigger_info) {
	var lat = parseMapValue(getMapSetting(link, trigger_info, "mapLat", "lat"));
	var lng = parseMapValue(getMapSetting(link, trigger_info, "mapLng", "lng"));
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

	var zoom = parseMapValue(getMapSetting(link, trigger_info, "mapZoom", "zoom"));
	var pitch = parseMapValue(getMapSetting(link, trigger_info, "mapPitch", "pitch"));
	var bearing = parseMapValue(getMapSetting(link, trigger_info, "mapBearing", "bearing"));
	var duration = parseMapValue(getMapSetting(link, trigger_info, "mapDuration", "duration"));
	var rotate_by = parseMapValue(getMapSetting(link, trigger_info, "mapRotateBy", "rotateBy"));
	var rotate_duration = parseMapValue(getMapSetting(link, trigger_info, "mapRotateDuration", "rotateDuration"));
	var rotate_speed = parseMapValue(getMapSetting(link, trigger_info, "mapRotateSpeed", "rotateSpeed"));
	var rotate_animation = parseBooleanValue(String(getMapSetting(link, trigger_info, "mapRotateAnimation", "rotateAnimation") || ""));
	var rotate_loop = parseBooleanValue(String(getMapSetting(link, trigger_info, "mapRotateLoop", "rotateLoop") || ""));
	var rotate_direction_raw = getMapSetting(link, trigger_info, "mapRotateDirection", "rotateDirection");
	var rotate_direction = String(rotate_direction_raw || "cw").toLowerCase() === "ccw" ? "ccw" : "cw";
	var hide_icons = parseBooleanValue(String(getMapSetting(link, trigger_info, "mapHideIcons", "hideIcons") || ""));
	var label = getMapSetting(link, trigger_info, "mapLabel", "label");
	var style = getMapSetting(link, trigger_info, "mapStyle", "style");

	return {
		center: [lng, lat],
		zoom: Number.isFinite(zoom) ? Math.max(1, Math.min(22, zoom)) : 12,
		pitch: Number.isFinite(pitch) ? Math.max(0, Math.min(85, pitch)) : 45,
		bearing: Number.isFinite(bearing) ? bearing : 0,
		duration: Number.isFinite(duration) ? Math.max(0, duration) : 1300,
		rotateAnimation: rotate_animation,
		rotateLoop: rotate_loop,
		rotateDirection: rotate_direction,
		hideIcons: hide_icons,
		rotateBy: Number.isFinite(rotate_by) ? rotate_by : 120,
		rotateDuration: Number.isFinite(rotate_duration) ? Math.max(0, rotate_duration) : 1800,
		rotateSpeed: Number.isFinite(rotate_speed) ? Math.max(0.1, rotate_speed) : 12,
		label: label || "",
		style: style || ""
	};
}

function setMapFog() {
	if (!map_overlay_map || !map_overlay_map.setFog) return;
	map_overlay_map.setFog({
		"horizon-blend": 0.2,
		"space-color": "#030712",
		"star-intensity": 0.15
	});
}

function setMapIconVisibility(show_icons) {
	if (!map_overlay_map || !map_overlay_map.getStyle || !map_overlay_map.setPaintProperty) return;
	var style = map_overlay_map.getStyle();
	if (!style || !Array.isArray(style.layers)) return;
	var style_key = style.sprite || active_map_style || "default";
	if (!map_icon_opacity_cache[style_key]) map_icon_opacity_cache[style_key] = {};
	var cache = map_icon_opacity_cache[style_key];

	style.layers.forEach(function(layer) {
		if (layer.type !== "symbol") return;
		if (!layer.layout || layer.layout["icon-image"] === undefined) return;

		if (cache[layer.id] === undefined) {
			var current = map_overlay_map.getPaintProperty(layer.id, "icon-opacity");
			cache[layer.id] = current === undefined ? 1 : current;
		}

		var next_opacity = show_icons ? cache[layer.id] : 0;
		try {
			map_overlay_map.setPaintProperty(layer.id, "icon-opacity", next_opacity);
		} catch (e) {}
	});
}

function fixStyleJson(style_json) {
	if (!style_json || !Array.isArray(style_json.layers)) return style_json;
	style_json.layers.forEach(function(layer) {
		if (layer.type !== "symbol" || !layer.layout) return;
		var img = layer.layout["icon-image"];
		if (img !== null && img !== undefined && typeof img === "object" && !Array.isArray(img)) {
			var keys = Object.keys(img);
			var fixed = keys.length > 0 ? String(img[keys[0]]) : null;
			if (fixed) layer.layout["icon-image"] = fixed;
		}
	});
	return style_json;
}

function applyPendingMapState() {
	if (!map_overlay_map || !pending_map_state) return;
	var state = pending_map_state;
	var sequence = ++map_camera_sequence;
	stopContinuousRotation();

	var applyCamera = function() {
		pending_map_state = null;
		setMapIconVisibility(!state.hideIcons);
		map_overlay_map.easeTo({
			center: state.center,
			zoom: state.zoom,
			pitch: state.pitch,
			bearing: state.bearing,
			duration: state.duration,
			essential: true
		});

		if (state.rotateAnimation) {
			map_overlay_map.once("moveend", function() {
				if (sequence !== map_camera_sequence) return;
				if (state.rotateLoop) {
					startContinuousRotation(sequence, state);
				}
				else {
					var direction = state.rotateDirection === "ccw" ? -1 : 1;
					map_overlay_map.rotateTo(state.bearing + (state.rotateBy * direction), {
						duration: state.rotateDuration,
						easing: function(t) { return t; }
					});
				}
			});
		}
	};

	if (state.style && state.style !== active_map_style) {
		active_map_style = state.style;
		map_overlay_map.setStyle(state.style);
		return;
	}

	applyCamera();
}

function initMapboxOverlay() {
	if (map_overlay) return;
	map_overlay = document.createElement("div");
	map_overlay.classList.add("fl-map-overlay", "fl-map-overlay-hidden");

	map_overlay_root = document.createElement("div");
	map_overlay_root.classList.add("fl-map-overlay-root");

	map_overlay_notice = document.createElement("p");
	map_overlay_notice.classList.add("fl-map-overlay-notice");
	map_overlay_notice.textContent = "Mapbox token missing. Set window.FL_SCROLLY_MAPBOX_TOKEN.";

	map_overlay_caption = document.createElement("p");
	map_overlay_caption.classList.add("fl-map-overlay-caption");

	map_overlay.appendChild(map_overlay_root);
	map_overlay.appendChild(map_overlay_notice);
	map_overlay.appendChild(map_overlay_caption);
	document.body.appendChild(map_overlay);

	if (!window.mapboxgl) {
		map_overlay_notice.style.display = "block";
		return;
	}

	var token = getMapboxToken();
	if (!token) {
		map_overlay_notice.style.display = "block";
		return;
	}

	window.mapboxgl.accessToken = token;
	map_overlay_notice.style.display = "none";

	var default_style = (document.body && document.body.dataset.mapStyle) || "mapbox://styles/mapbox/satellite-streets-v12";
	active_map_style = default_style;

	function createMapWithStyle(resolved_style) {
		map_overlay_map = new window.mapboxgl.Map({
			container: map_overlay_root,
			style: resolved_style,
			center: [-73.9857, 40.7484],
			zoom: 10,
			pitch: 45,
			bearing: 0,
			interactive: false,
			attributionControl: false
		});

		map_overlay_map.on("style.load", function() {
			map_is_ready = true;
			setMapFog();
			applyPendingMapState();
		});

		map_overlay_map.on("error", function(event) {
			var message = event && event.error && event.error.message ? event.error.message : "Unknown Mapbox error";
			if (message.indexOf("Secondary image variant") !== -1 || message.indexOf("Bare objects invalid") !== -1) return;
			map_overlay_notice.textContent = "Mapbox error: " + message;
			map_overlay_notice.style.display = "block";
		});
	}

	// For local/relative JSON files: fetch, patch bare icon-image objects, then pass cleaned JSON
	// to the Map constructor so Mapbox never sees the broken expressions.
	// For mapbox:// URLs: pass directly (Mapbox handles auth internally).
	if (default_style.indexOf("mapbox://") !== 0) {
		fetch(default_style)
			.then(function(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
			.then(function(json) { createMapWithStyle(fixStyleJson(json)); })
			.catch(function(err) {
				map_overlay_notice.textContent = "Could not load style JSON: " + err.message;
				map_overlay_notice.style.display = "block";
			});
	} else {
		createMapWithStyle(default_style);
	}
}

function updateMapboxOverlay(link, trigger_info) {
	if (!map_overlay) initMapboxOverlay();

	var state = parseMapState(link, trigger_info);
	if (!state) {
		map_overlay.classList.add("fl-map-overlay-hidden");
		return;
	}

	map_overlay_caption.textContent = state.label;
	map_overlay.classList.remove("fl-map-overlay-hidden");

	pending_map_state = state;
	if (!map_is_ready) return; // held until style.load fires
	applyPendingMapState();
}


function parents(node) {
	var nodes = [node]
	for (; node; node = node.parentNode) {
		nodes.unshift(node)
	}
	return nodes;
}

function commonAncestor(node1, node2) {
	var parents1 = parents(node1);
	var parents2 = parents(node2);
	if (parents1[0] != parents2[0]) throw "No common ancestor!";
	for (var i = 0; i < parents1.length; i++) {
		if (parents1[i] != parents2[i]) return parents1[i - 1]
	}
}

function initStyles() {
	// TODO. The user should be able to override these!
	var style = document.createElement("style");
	style.innerHTML = "" +
		".fl-scrolly-section {" +
			"position: relative;" +
			"z-index: 10;" +
		"}" +
		".fl-scrolly-sticky {" +
			"position: fixed;" +
			"top: max(12px, 2vh);" +
			"right: max(12px, 2vw);" +
			"width: clamp(210px, 44vw, 320px);" +
			"height: clamp(120px, 26vw, 180px);" +
			"max-width: calc(100vw - 24px);" +
			"max-height: calc(100vh - 24px);" +
			"margin: 0;" +
			"box-sizing: border-box;" +
			"padding: 10px;" +
			"background: rgba(12, 20, 26, 0.9);" +
			"backdrop-filter: blur(4px);" +
			"border: 1px solid rgba(255, 255, 255, 0.18);" +
			"border-radius: 12px;" +
			"box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);" +
			"opacity: 0;" +
			"visibility: hidden;" +
			"transform: translate3d(calc(var(--fl-scrolly-shift-x, 72px) * 0.45), 20px, 0) scale(0.97);" +
			"filter: saturate(0.8) blur(2px);" +
			"transition: opacity 900ms ease, transform 1100ms cubic-bezier(0.22, 1, 0.36, 1), filter 900ms ease, visibility 0s linear 900ms;" +
			"will-change: opacity, transform, filter;" +
			"z-index: 40;" +
			"display: flex;" +
			"align-items: stretch;" +
			"justify-content: center;" +
			"overflow: hidden;" +
		"}" +
		".fl-scrolly-sticky figure, .fl-scrolly-sticky .flourish-embed, .fl-scrolly-sticky iframe {" +
			"width: 100%;" +
			"height: 100%;" +
			"max-height: 100vh;" +
			"max-height: 100dvh;" +
			"margin: 0;" +
		"}" +
		".fl-scrolly-sticky .flourish-embed {" +
			"position: relative !important;" +
			"padding-bottom: 0 !important;" +
			"min-height: 100%;" +
			"height: 100% !important;" +
			"overflow: hidden;" +
			"border-radius: 8px;" +
		"}" +
		".fl-scrolly-sticky .flourish-embed iframe {" +
			"position: absolute !important;" +
			"inset: 0 !important;" +
			"top: 0 !important;" +
			"height: 100% !important;" +
			"width: 100% !important;" +
		"}" +
		".fl-scrolly-sticky figure {" +
			"display: flex;" +
			"align-items: stretch;" +
			"margin: 0;" +
			"padding: 0;" +
		"}" +
		".fl-scrolly-sticky.fl-scrolly-active {" +
			"opacity: 1;" +
			"visibility: visible;" +
			"transform: translate3d(0, 0, 0) scale(1);" +
			"filter: none;" +
			"transition: opacity 900ms ease, transform 1100ms cubic-bezier(0.22, 1, 0.36, 1), filter 900ms ease, visibility 0s linear 0s;" +
			"z-index: 45;" +
			"pointer-events: none;" +
		"}" +
		".fl-scrolly-sticky.fl-scrolly-inactive {" +
			"opacity: 0;" +
			"visibility: hidden;" +
			"pointer-events: none;" +
		"}" +
		".fl-scrolly-section .fl-scrolly-step {" +
			"position: relative;" +
			"z-index: 20;" +
			"width: min(84vw, 760px);" +
			"height: auto;" +	
			"margin: 0 0 50vh;" +
			"padding: 1.25em;" +
			"background: #333;" +
			"box-shadow: 3px 3px 5px rgba(0,0,0,0.1);" +
			"font-family: Helvetica, sans-serif;" + 
			"font-size: clamp(18px, 2.2vw, 34px);" +
			"font-weight: 600;" +
			"line-height: 1.3;" +
			"opacity: 0.22;" +
			"text-align: left;" +
			"transform: translate3d(-20px, 18px, 0); /* Workaround for Safari https://stackoverflow.com/questions/50224855/not-respecting-z-index-on-safari-with-position-sticky */" +
			"filter: blur(0.5px);" +
			"transition: opacity 700ms ease, transform 850ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 700ms ease, filter 700ms ease;" +
			"transition-delay: var(--fl-step-delay, 0ms);" +
		"}" +
		".fl-scrolly-section-active .fl-scrolly-step.fl-scrolly-step-visible {" +
			"opacity: 0.72;" +
			"transform: translate3d(0, 0, 0);" +
			"filter: none;" +
		"}" +
		".fl-scrolly-section-active .fl-scrolly-step.fl-scrolly-step-active {" +
			"opacity: 1;" +
			"box-shadow: 0 14px 40px rgba(0,0,0,0.22);" +
			"transform: translate3d(12px, 0, 0);" +
		"}" +
		".fl-scrolly-step.fl-scrolly-step-muted {" +
			"opacity: 0.14;" +
			"transform: translate3d(-28px, 24px, 0);" +
			"filter: blur(1px);" +
		"}" +
		".fl-scrolly-section .fl-scrolly-step a {" +
			"color: inherit;" +
		"}" +
		".fl-map-overlay {" +
			"position: fixed;" +
			"top: 0;" +
			"left: 0;" +
			"width: 100vw;" +
			"height: 100vh;" +
			"height: 100dvh;" +
			"z-index: 2;" +
			"background: #05090f;" +
			"padding: 0;" +
			"transition: opacity 260ms ease, transform 300ms ease;" +
			"opacity: 1;" +
			"transform: translate3d(0, 0, 0);" +
		"}" +
		".fl-map-overlay-root {" +
			"width: 100%;" +
			"height: 100%;" +
			"overflow: hidden;" +
			"border-radius: 0;" +
		"}" +
		".fl-map-overlay-root canvas {" +
			"border-radius: 0;" +
		"}" +
		".fl-map-overlay-caption {" +
			"position: absolute;" +
			"left: 20px;" +
			"right: 20px;" +
			"bottom: 14px;" +
			"margin: 0;" +
			"padding: 8px 10px;" +
			"background: rgba(3, 7, 18, 0.48);" +
			"backdrop-filter: blur(2px);" +
			"border-radius: 8px;" +
			"font: 600 12px/1.3 Helvetica, Arial, sans-serif;" +
			"letter-spacing: 0.02em;" +
			"color: rgba(255, 255, 255, 0.92);" +
			"white-space: nowrap;" +
			"overflow: hidden;" +
			"text-overflow: ellipsis;" +
		"}" +
		".fl-map-overlay-notice {" +
			"display: none;" +
			"position: absolute;" +
			"top: 16px;" +
			"left: 16px;" +
			"right: 16px;" +
			"margin: 0;" +
			"padding: 8px 10px;" +
			"background: rgba(3, 7, 18, 0.72);" +
			"border-radius: 8px;" +
			"font: 600 12px/1.3 Helvetica, Arial, sans-serif;" +
			"color: #fecaca;" +
		"}" +
		".fl-map-overlay.fl-map-overlay-hidden {" +
			"opacity: 0;" +
			"transform: scale(1.02);" +
			"pointer-events: none;" +
		"}" +
		"@media (max-width: 900px) {" +
			".fl-scrolly-sticky {" +
				"top: auto;" +
				"right: 10px;" +
				"bottom: 10px;" +
				"left: 10px;" +
				"width: auto;" +
				"height: clamp(180px, 34vw, 240px);" +
				"max-height: 34vh;" +
			"}" +
			".fl-scrolly-section .fl-scrolly-step {" +
				"width: calc(100% - 20px);" +
				"font-size: clamp(16px, 5vw, 24px);" +
				"line-height: 1.4;" +
				"padding: 1em;" +
			"}" +
		"}";
	document.body.appendChild(style);
}

function init() {
	initLinks(); // Find suitable links and add styles and click handlers
	initStories(); // Find embedded stories and reorganise the DOM around them
	initStepTransitions(); // Prepare stagger timings for text panels
	initIntersection(); // Initialise the scrolly triggers
	initStyles(); // Add a stylesheet with required styles
	initMapboxOverlay(); // Prepare optional Mapbox overlay
	initStoryTransitions(); // Animate handoff between story sections
}
init();
