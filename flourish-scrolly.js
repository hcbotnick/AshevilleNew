function initStories() {
	var stories = document.querySelectorAll(".flourish-embed");
	for (var i = 0; i < stories.length; i++) {
		var story = stories[i];
		var id = story.dataset.src.split("/")[1];
		var h = story.getAttribute("data-height") || "75vh";
		var lastLink = last_link_per_story["story-" + id];
		var commonParent = commonAncestor(story, lastLink);

		story.id = "story-" + id;

		var targetDiv = document.createElement("div");
		targetDiv.classList.add("fl-scrolly-section");
		targetDiv.style.position = "relative";
		targetDiv.style.paddingBottom = "1px";
		targetDiv.id = "fl-scrolly-section-" + id;
		targetDiv.dataset.storyId = id;
		targetDiv.dataset.storyIndex = i;
		story_index_by_id[id] = i;

		commonParent.classList.add("fl-scrolly-parent-" + id);

		var children = document.querySelectorAll(".fl-scrolly-parent-" + id + " > *");
		story.__found_story__ = false;
		for (var j = 0; j < children.length; j++) {
			var child = children[j];
			if (story.__found_story__) {
				targetDiv.appendChild(child);
				if (child.querySelector(".fl-scrolly-last-link-story-" + id)) break;
			} else {
				var embed = child.id === "story-" + id || child.querySelector("#story-" + id);
				if (embed) {
					story.__found_story__ = true;
					child.style.setProperty("--fl-scrolly-height", h);
					child.classList.add("fl-scrolly-sticky");
					child.dataset.storyId = id;
					child.dataset.storyIndex = i;
					commonParent.insertBefore(targetDiv, child);
					targetDiv.appendChild(child);
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
var map_overlay_notice = null;
var map_overlay_map = null;
var map_is_ready = false;
var pending_map_state = null;
var active_map_style = "";
var map_camera_sequence = 0;
var map_rotate_animation_frame = null;
var map_icon_opacity_cache = {};
var map_step_markers = [];

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

	var storyId = el.dataset ? el.dataset.storyId : null;
	var slideNumber = el.dataset ? parseFloat(el.dataset.slide) : null;
	if (!storyId || !Number.isFinite(slideNumber)) return null;

	return {
		storyId: storyId,
		slideNumber: slideNumber
	};
}

function getScrollyTriggers() {
	return document.querySelectorAll("a[href*='#story/'], [data-story-id][data-slide], [data-intro-chapter]");
}

function initLinks() {
	var triggers = getScrollyTriggers();
	for (var i = 0; i < triggers.length; i++) {
		var trigger = triggers[i];
		var triggerInfo = parseTriggerInfo(trigger);
		if (!triggerInfo) continue;

		var step = getTriggerStep(trigger);
		var id = triggerInfo.storyId;
		last_link_per_story["story-" + id] = step;
		trigger.classList.add("fl-scrolly-link", "story-" + id);
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
	var observer = new IntersectionObserver(function(entries) {
		entries.forEach(function(entry) {
			if (!entry.isIntersecting) return;
			setActiveStep(getTriggerStep(entry.target));
			updateStoryFromTrigger(entry.target);
		});
	}, { rootMargin: "0px 0px -45% 0px", threshold: 0.02 });

	getScrollyTriggers().forEach(function(trigger) {
		observer.observe(trigger);
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
	var hasIndex = Number.isFinite(story_index_by_id[id]);
	var nextIndex = hasIndex ? story_index_by_id[id] : active_story_index;
	active_story_id = id;
	if (hasIndex) active_story_index = nextIndex;

	document.querySelectorAll(".fl-scrolly-sticky").forEach(function(sticky) {
		var isActive = hasIndex && sticky.dataset.storyId === id;
		sticky.classList.toggle("fl-scrolly-active", isActive);
		sticky.classList.toggle("fl-scrolly-inactive", !isActive);
		sticky.style.display = isActive ? "flex" : "none";
	});

	document.querySelectorAll(".fl-scrolly-section").forEach(function(section) {
		section.classList.toggle("fl-scrolly-section-active", section.dataset.storyId === id);
	});
}

function initStoryTransitions() {
	var sections = document.querySelectorAll(".fl-scrolly-section");
	if (!sections.length) return;

	var observer = new IntersectionObserver(function(entries) {
		var next = null;
		entries.forEach(function(entry) {
			if (!entry.isIntersecting) return;
			if (!next || entry.intersectionRatio > next.intersectionRatio) next = entry;
		});
		if (next) setActiveStory(next.target.dataset.storyId);
	}, {
		threshold: [0.2, 0.4, 0.6],
		rootMargin: "-10% 0px -30% 0px"
	});

	sections.forEach(function(section) {
		observer.observe(section);
	});

	setActiveStory(sections[0].dataset.storyId);
}

function updateStoryFromTrigger(el) {
	if (el && el.dataset && el.dataset.introChapter !== undefined) {
		stopContinuousRotation();
		clearMapStepMarker();
		setVideoTransitionActive(false);
		return;
	}

	var triggerInfo = parseTriggerInfo(el);
	if (!triggerInfo) return;

	var slideId = triggerInfo.slideNumber - 1;
	var step = getTriggerStep(el);
	var section = step.closest(".fl-scrolly-section");
	var iframe = section ? section.querySelector(".flourish-embed iframe") : null;

	var hideTrajectory = section && section.dataset && section.dataset.hideTrajectory === "true";
	setTrajectoryLayerVisibility(!hideTrajectory);

	setActiveStory(triggerInfo.storyId);
	updateMapboxOverlay(triggerInfo);
	if (!iframe) return;

	iframe.src = iframe.src.replace(/#slide-.*/, "") + "#slide-" + slideId;
}

function parseMapValue(value) {
	var parsed = parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseBooleanValue(value) {
	if (typeof value !== "string") return false;
	var normalized = value.toLowerCase();
	return normalized === "true" || normalized === "1" || normalized === "yes";
}

function getMapboxToken() {
	if (window.FL_SCROLLY_MAPBOX_TOKEN) return window.FL_SCROLLY_MAPBOX_TOKEN;
	if (document.body && document.body.dataset.mapboxToken) return document.body.dataset.mapboxToken;
	var tokenMeta = document.querySelector('meta[name="mapbox-token"]');
	if (tokenMeta) return tokenMeta.getAttribute("content");
	return "";
}

function stopContinuousRotation() {
	if (map_rotate_animation_frame === null) return;
	cancelAnimationFrame(map_rotate_animation_frame);
	map_rotate_animation_frame = null;
}

function getStepConfig(storyId, slideNumber) {
	var config = window.FL_SCROLLY_STEP_CONFIG || window.flScrollyStepConfig;
	if (!config || !storyId || !Number.isFinite(slideNumber)) return null;
	var storyKey = String(storyId);
	var slideKey = String(slideNumber);
	if (config[storyKey] && config[storyKey][slideKey]) return config[storyKey][slideKey];
	if (config[storyKey + ":" + slideKey]) return config[storyKey + ":" + slideKey];
	if (config[storyKey + "-" + slideKey]) return config[storyKey + "-" + slideKey];
	return null;
}

function getMapSetting(triggerInfo, configKey) {
	var config = getStepConfig(triggerInfo.storyId, triggerInfo.slideNumber);
	if (!config) return null;
	if (config[configKey] === undefined || config[configKey] === null) return null;
	return config[configKey];
}

function parseMapState(triggerInfo) {
	var lat = parseMapValue(getMapSetting(triggerInfo, "lat"));
	var lng = parseMapValue(getMapSetting(triggerInfo, "lng"));
	var zoom = parseMapValue(getMapSetting(triggerInfo, "zoom"));
	var pitch = parseMapValue(getMapSetting(triggerInfo, "pitch"));
	var bearing = parseMapValue(getMapSetting(triggerInfo, "bearing"));
	var hideMap = parseBooleanValue(String(getMapSetting(triggerInfo, "hideMap") || ""));
	var duration = parseMapValue(getMapSetting(triggerInfo, "duration"));
	var rotateBy = parseMapValue(getMapSetting(triggerInfo, "rotateBy"));
	var rotateDuration = parseMapValue(getMapSetting(triggerInfo, "rotateDuration"));
	var rotateSpeed = parseMapValue(getMapSetting(triggerInfo, "rotateSpeed"));
	var rotateAnimation = parseBooleanValue(String(getMapSetting(triggerInfo, "rotateAnimation") || ""));
	var rotateLoop = parseBooleanValue(String(getMapSetting(triggerInfo, "rotateLoop") || ""));
	var rotateDirectionRaw = getMapSetting(triggerInfo, "rotateDirection");
	var rotateDirection = String(rotateDirectionRaw || "cw").toLowerCase() === "ccw" ? "ccw" : "cw";
	var hideIcons = parseBooleanValue(String(getMapSetting(triggerInfo, "hideIcons") || ""));
	var markerColor = String(getMapSetting(triggerInfo, "markerColor") || "#ef4444");
	var rawMarkers = getMapSetting(triggerInfo, "markers");
	var markers = [];

	if (Array.isArray(rawMarkers)) {
		for (var i = 0; i < rawMarkers.length; i++) {
			var marker = rawMarkers[i];
			if (!marker || typeof marker !== "object") continue;
			var markerLat = parseMapValue(marker.lat);
			var markerLng = parseMapValue(marker.lng);
			if (!Number.isFinite(markerLat) || !Number.isFinite(markerLng)) continue;
			var markerShow = marker.showMarker === undefined ? true : parseBooleanValue(String(marker.showMarker));
			markers.push({
				lngLat: [markerLng, markerLat],
				markerColor: String(marker.markerColor || marker.color || markerColor || "#ef4444"),
				showMarker: markerShow,
				title: marker.title ? String(marker.title) : "",
				text: marker.text ? String(marker.text) : "",
				imageSrc: marker.imageSrc ? String(marker.imageSrc) : "",
				imageAlt: marker.imageAlt ? String(marker.imageAlt) : "",
				linkHref: marker.linkHref ? String(marker.linkHref) : ""
			});
		}
	}

	var hasExplicitCenter = Number.isFinite(lat) && Number.isFinite(lng);
	if (!hasExplicitCenter && markers.length) {
		lng = markers[0].lngLat[0];
		lat = markers[0].lngLat[1];
		hasExplicitCenter = true;
	}
	if (!hasExplicitCenter) return null;

	var showMarkerSetting = getMapSetting(triggerInfo, "showMarker");
	var showMarker = showMarkerSetting === null ? markers.length > 0 : parseBooleanValue(String(showMarkerSetting || ""));
	var label = getMapSetting(triggerInfo, "label");
	var style = getMapSetting(triggerInfo, "style");

	return {
		center: [lng, lat],
		zoom: Number.isFinite(zoom) ? Math.max(1, Math.min(22, zoom)) : 12,
		pitch: Number.isFinite(pitch) ? Math.max(0, Math.min(85, pitch)) : 45,
		bearing: Number.isFinite(bearing) ? bearing : 0,
		hideMap: hideMap,
		duration: Number.isFinite(duration) ? Math.max(0, duration) : 1300,
		rotateAnimation: rotateAnimation,
		rotateLoop: rotateLoop,
		rotateDirection: rotateDirection,
		hideIcons: hideIcons,
		showMarker: showMarker,
		markerColor: markerColor,
		markers: markers,
		rotateBy: Number.isFinite(rotateBy) ? rotateBy : 120,
		rotateDuration: Number.isFinite(rotateDuration) ? Math.max(0, rotateDuration) : 1800,
		rotateSpeed: Number.isFinite(rotateSpeed) ? Math.max(0.1, rotateSpeed) : 12,
		label: label || "",
		style: style || ""
	};
}

function getInitialMapState() {
	var triggers = getScrollyTriggers();
	for (var i = 0; i < triggers.length; i++) {
		var info = parseTriggerInfo(triggers[i]);
		if (!info) continue;
		var state = parseMapState(info);
		if (!state || state.hideMap) continue;
		return state;
	}
	return null;
}

function clearMapStepMarker() {
	if (!map_step_markers.length) return;
	map_step_markers.forEach(function(marker) {
		marker.remove();
	});
	map_step_markers = [];
}

function setVideoTransitionActive(active) {
	if (!document.body) return;
	document.body.classList.toggle("fl-video-transition-active", !!active);
}

function buildCustomMarkerCard(marker, state) {
	var card = document.createElement("figure");
	card.className = "map-marker-slide map-marker-card";

	if (marker.imageSrc) {
		var media = document.createElement("div");
		media.className = "map-marker-card-media";

		var img = document.createElement("img");
		img.src = marker.imageSrc;
		img.alt = marker.imageAlt || "Story location";
		media.appendChild(img);

		if (marker.linkHref) {
			var imageLink = document.createElement("a");
			imageLink.className = "map-marker-image-link";
			imageLink.href = marker.linkHref;
			imageLink.target = "_blank";
			imageLink.rel = "noopener noreferrer";
			imageLink.textContent = "Read more";
			imageLink.addEventListener("pointerdown", function() {
				this.classList.add("is-pressed");
			});
			imageLink.addEventListener("pointerup", function() {
				this.classList.remove("is-pressed");
			});
			imageLink.addEventListener("pointercancel", function() {
				this.classList.remove("is-pressed");
			});
			imageLink.addEventListener("mouseleave", function() {
				this.classList.remove("is-pressed");
			});
			imageLink.addEventListener("blur", function() {
				this.classList.remove("is-pressed");
			});
			media.appendChild(imageLink);
		}

		card.appendChild(media);
	}

	var caption = document.createElement("figcaption");
	if (marker.title) {
		var heading = document.createElement("h4");
		heading.className = "map-marker-card-title";
		heading.textContent = marker.title;
		caption.appendChild(heading);
	}
	if (marker.text) {
		var body = document.createElement("p");
		body.textContent = marker.text;
		caption.appendChild(body);
	}
	if (!caption.childNodes.length && state && state.label) {
		var fallback = document.createElement("p");
		fallback.textContent = state.label;
		caption.appendChild(fallback);
	}
	card.appendChild(caption);

	return card;
}

function buildMarkerSlideElement(marker, state) {
	var host = document.createElement("div");
	host.className = "map-marker-slide-host";
	host.appendChild(buildCustomMarkerCard(marker, state));
	return host;
}

function setMapStepMarker(state) {
	if (!map_overlay_map || !window.mapboxgl || !state) return;
	clearMapStepMarker();
	if (!state.showMarker) return;

	var markers = Array.isArray(state.markers) ? state.markers.filter(function(marker) {
		return marker && marker.showMarker !== false;
	}) : [];

	if (!markers.length) {
		markers = [{
			lngLat: state.center,
			markerColor: state.markerColor,
			showMarker: true,
			title: "",
			text: state.label || "",
			imageSrc: "",
			imageAlt: "",
			linkHref: ""
		}];
	}

	for (var i = 0; i < markers.length; i++) {
		var marker = markers[i];
		if (!marker || !Array.isArray(marker.lngLat)) continue;
		var markerElement = buildMarkerSlideElement(marker, state);
		var mapMarker = new window.mapboxgl.Marker({ element: markerElement, anchor: "bottom" });
		mapMarker.setLngLat(marker.lngLat).addTo(map_overlay_map);
		map_step_markers.push(mapMarker);
	}
}

function setTrajectoryLayerVisibility(visible) {
	if (!map_overlay_map || !map_overlay_map.getLayer) return;
	var trajectoryLayers = [
		"untitled-spreadsheet-sheet1-8-csv",
		"untitled-layer",
		"untitled-layer copy",
		"untitled-layer copy 1",
		"untitled-layer copy 2"
	];
	var visibility = visible ? "visible" : "none";
	trajectoryLayers.forEach(function(id) {
		try {
			if (map_overlay_map.getLayer(id)) {
				map_overlay_map.setLayoutProperty(id, "visibility", visibility);
			}
		} catch (e) {}
	});
}

function setMapFog() {
	if (!map_overlay_map || !map_overlay_map.setFog) return;
	map_overlay_map.setFog({
		"horizon-blend": 0.2,
		"space-color": "#030712",
		"star-intensity": 0.15
	});
}

function setMapIconVisibility(showIcons) {
	if (!map_overlay_map || !map_overlay_map.getStyle || !map_overlay_map.setPaintProperty) return;
	var style = map_overlay_map.getStyle();
	if (!style || !Array.isArray(style.layers)) return;
	var styleKey = style.sprite || active_map_style || "default";
	if (!map_icon_opacity_cache[styleKey]) map_icon_opacity_cache[styleKey] = {};
	var cache = map_icon_opacity_cache[styleKey];

	style.layers.forEach(function(layer) {
		if (layer.type !== "symbol") return;
		if (!layer.layout || layer.layout["icon-image"] === undefined) return;
		if (cache[layer.id] === undefined) {
			var current = map_overlay_map.getPaintProperty(layer.id, "icon-opacity");
			cache[layer.id] = current === undefined ? 1 : current;
		}
		try {
			map_overlay_map.setPaintProperty(layer.id, "icon-opacity", showIcons ? cache[layer.id] : 0);
		} catch (e) {}
	});
}

function fixStyleJson(styleJson) {
	if (!styleJson || !Array.isArray(styleJson.layers)) return styleJson;
	styleJson.layers.forEach(function(layer) {
		if (layer.type !== "symbol" || !layer.layout) return;
		var img = layer.layout["icon-image"];
		if (img !== null && img !== undefined && typeof img === "object" && !Array.isArray(img)) {
			var keys = Object.keys(img);
			var fixed = keys.length > 0 ? String(img[keys[0]]) : null;
			if (fixed) layer.layout["icon-image"] = fixed;
		}
	});
	return styleJson;
}

function startContinuousRotation(sequence, state) {
	stopContinuousRotation();
	var lastFrameTime = null;
	var direction = state.rotateDirection === "ccw" ? -1 : 1;

	var tick = function(timestamp) {
		if (sequence !== map_camera_sequence || !map_overlay_map) {
			stopContinuousRotation();
			return;
		}
		if (lastFrameTime === null) lastFrameTime = timestamp;
		var elapsedSeconds = (timestamp - lastFrameTime) / 1000;
		lastFrameTime = timestamp;
		var nextBearing = map_overlay_map.getBearing() + (state.rotateSpeed * direction * elapsedSeconds);
		map_overlay_map.setBearing(nextBearing);
		map_rotate_animation_frame = requestAnimationFrame(tick);
	};

	map_rotate_animation_frame = requestAnimationFrame(tick);
}

function applyPendingMapState() {
	if (!map_overlay_map || !pending_map_state) return;
	var state = pending_map_state;
	var sequence = ++map_camera_sequence;
	stopContinuousRotation();

	var applyCamera = function() {
		pending_map_state = null;
		setMapIconVisibility(!state.hideIcons);
		setMapStepMarker(state);
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
				} else {
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
	map_overlay.classList.add("fl-map-overlay");

	map_overlay_root = document.createElement("div");
	map_overlay_root.classList.add("fl-map-overlay-root");

	map_overlay_notice = document.createElement("p");
	map_overlay_notice.classList.add("fl-map-overlay-notice");
	map_overlay_notice.textContent = "Mapbox token missing. Set window.FL_SCROLLY_MAPBOX_TOKEN.";

	map_overlay.appendChild(map_overlay_root);
	map_overlay.appendChild(map_overlay_notice);
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

	var defaultStyle = (document.body && document.body.dataset.mapStyle) || "mapbox://styles/mapbox/satellite-streets-v12";
	active_map_style = defaultStyle;

	function createMapWithStyle(resolvedStyle) {
		var initialState = getInitialMapState();
		if (initialState) pending_map_state = initialState;
		map_overlay_map = new window.mapboxgl.Map({
			container: map_overlay_root,
			style: resolvedStyle,
			center: initialState ? initialState.center : [-73.9857, 40.7484],
			zoom: initialState ? initialState.zoom : 10,
			pitch: initialState ? initialState.pitch : 45,
			bearing: initialState ? initialState.bearing : 0,
			interactive: false,
			attributionControl: false
		});

		map_overlay_map.on("style.load", function() {
			map_is_ready = true;
			setMapFog();
			applyPendingMapState();
		});
	}

	if (defaultStyle.indexOf("mapbox://") !== 0) {
		fetch(defaultStyle)
			.then(function(r) {
				if (!r.ok) throw new Error("HTTP " + r.status);
				return r.json();
			})
			.then(function(json) {
				createMapWithStyle(fixStyleJson(json));
			})
			.catch(function(err) {
				map_overlay_notice.textContent = "Could not load style JSON: " + err.message;
				map_overlay_notice.style.display = "block";
			});
	} else {
		createMapWithStyle(defaultStyle);
	}
}

function updateMapboxOverlay(triggerInfo) {
	if (!map_overlay) initMapboxOverlay();
	var state = parseMapState(triggerInfo);
	if (!state) {
		if (map_overlay) map_overlay.style.display = "block";
		setVideoTransitionActive(false);
		clearMapStepMarker();
		return;
	}
	if (state.hideMap) {
		stopContinuousRotation();
		clearMapStepMarker();
		pending_map_state = state;
		if (map_is_ready) {
			applyPendingMapState();
		}
		if (map_overlay) map_overlay.style.display = "none";
		setVideoTransitionActive(true);
		return;
	}
	if (map_overlay) map_overlay.style.display = "block";
	setVideoTransitionActive(false);
	pending_map_state = state;
	if (!map_is_ready) return;
	applyPendingMapState();
}

function parents(node) {
	var nodes = [node];
	for (; node; node = node.parentNode) {
		nodes.unshift(node);
	}
	return nodes;
}

function commonAncestor(node1, node2) {
	var parents1 = parents(node1);
	var parents2 = parents(node2);
	if (parents1[0] !== parents2[0]) throw new Error("No common ancestor");
	for (var i = 0; i < parents1.length; i++) {
		if (parents1[i] !== parents2[i]) return parents1[i - 1];
	}
	return parents1[parents1.length - 1];
}

function initStyles() {
	var style = document.createElement("style");
	style.innerHTML = "" +
		".fl-scrolly-section { position: relative; z-index: 10; }" +
		".fl-scrolly-sticky { position: fixed; top: max(12px, 2vh); right: max(12px, 2vw); width: clamp(240px, 48vw, 420px); height: clamp(150px, 32vw, 280px); max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); margin: 0; box-sizing: border-box; padding: 10px; background: #05090f; border: 1px solid rgba(255,255,255,0.18); z-index: 40; display: none; align-items: stretch; justify-content: center; overflow: hidden; }" +
		".fl-scrolly-sticky figure, .fl-scrolly-sticky .flourish-embed, .fl-scrolly-sticky iframe { width: 100%; height: 100%; max-height: 100vh; margin: 0; }" +
		".fl-scrolly-sticky .flourish-embed { position: relative !important; padding-bottom: 0 !important; min-height: 100%; height: 100% !important; overflow: hidden; border-radius: 8px; background: #05090f; }" +
		".fl-scrolly-sticky .flourish-embed iframe { position: absolute !important; inset: 0 !important; height: 100% !important; width: 100% !important; }" +
		".fl-scrolly-section .fl-scrolly-step { position: relative; z-index: 20; width: min(42vw, 380px); margin: 0 0 50vh; text-align: left; }" +
		".fl-map-overlay { position: fixed; inset: 0; z-index: 2; background: #05090f; pointer-events: auto; }" +
		".fl-map-overlay-root { width: 100%; height: 100%; overflow: hidden; pointer-events: none; }" +
		".fl-map-overlay-root canvas { pointer-events: none; }" +
		".fl-map-overlay-root .mapboxgl-marker, .fl-map-overlay-root .mapboxgl-marker *, .fl-map-overlay-root .map-marker-slide-host, .fl-map-overlay-root .map-marker-slide-host * { pointer-events: auto; }" +
		".fl-map-overlay-notice { display: none; position: absolute; top: 16px; left: 16px; right: 16px; margin: 0; padding: 8px 10px; background: rgba(3, 7, 18, 0.72); border-radius: 8px; font: 600 12px/1.3 Helvetica, Arial, sans-serif; color: #fecaca; }" +
		"@media (max-width: 900px) { .fl-scrolly-sticky { top: auto; right: 10px; bottom: 10px; left: 10px; width: auto; height: clamp(180px, 34vw, 240px); max-height: 34vh; } .fl-scrolly-section .fl-scrolly-step { width: calc(100% - 20px); } }";
	document.body.appendChild(style);
}

function init() {
	initLinks();
	initStories();
	initIntersection();
	initStyles();
	initMapboxOverlay();
	initStoryTransitions();
}

init();
