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
function initLinks() {
	var links = document.getElementsByTagName("a");
	for (var i = 0; i < links.length; i++) {
		var link = links[i],
		    href = link.getAttribute("href");

		// Ignore non-Flourish links
		if (!href || !href.match(/#story\/\d+/)) continue;

		// // Get the ID and set classes
		var id = href.split("/")[1];
		last_link_per_story["story-" + id] = link;
		link.classList.add("fl-scrolly-link");
		link.classList.add("story-" + id);
		link.parentNode.classList.add("fl-scrolly-step");

		link.addEventListener("click", function(e) {
			e.preventDefault();
			setActiveStep(this.parentNode);
			updateStoryFromLink(this);
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
				setActiveStep(entry.target.parentNode);
				updateStoryFromLink(entry.target);
			}
		});
	}, { rootMargin: "0px 0px -50% 0px" });
	document.querySelectorAll(".fl-scrolly-link").forEach(function(link) {
		return observer.observe(link);
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

function updateStoryFromLink(el) {
	var link_array = el.getAttribute("href").split("/");
	var story_id = link_array[1];
	var slide_number = parseFloat(link_array[link_array.length - 1].replace("slide-", ""));
	var slide_id = slide_number - 1;
	setActiveStory(story_id);
	var iframe = el.parentElement.parentElement.querySelector(".flourish-embed iframe"); // TODO: Recursive parent search
	iframe.src = iframe.src.replace(/#slide-.*/, "") + "#slide-" + slide_id;
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
			"top: 0;" +
			"left: 0;" +
			"height: 100vh;" +
			"height: 100dvh;" +
			"width: 100vw;" +
			"max-width: 100vw;" +
			"max-height: 100vh;" +
			"max-height: 100dvh;" +
			"margin: 0;" +
			"box-sizing: border-box;" +
			"opacity: 0;" +
			"visibility: hidden;" +
			"transform: translate3d(var(--fl-scrolly-shift-x, 72px), 32px, 0) scale(0.97);" +
			"filter: saturate(0.8) blur(2px);" +
			"transition: opacity 900ms ease, transform 1100ms cubic-bezier(0.22, 1, 0.36, 1), filter 900ms ease, visibility 0s linear 900ms;" +
			"will-change: opacity, transform, filter;" +
			"z-index: 2;" +
			"display: flex;" +
			"align-items: stretch;" +
			"justify-content: center;" +
			"overflow: visible;" +
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
			"z-index: 3;" +
			"pointer-events: auto;" +
		"}" +
		".fl-scrolly-sticky.fl-scrolly-inactive {" +
			"opacity: 0;" +
			"visibility: hidden;" +
			"pointer-events: none;" +
		"}" +
		".fl-scrolly-section .fl-scrolly-step {" +
			"position: relative;" +
			"z-index: 20;" +
			"width: 50%;" +
			"margin: 0 0 50vh;" +
			"padding: 1.25em;" +
			"background: #333;" +
			"box-shadow: 3px 3px 5px rgba(0,0,0,0.1);" +
			"font-family: Helvetica, sans-serif;" +
			"border-radius: 10px;" +
			"opacity: 0.22;" +
			"text-align: center;" +
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
		"}";
	document.body.appendChild(style);
}

function init() {
	initLinks(); // Find suitable links and add styles and click handlers
	initStories(); // Find embedded stories and reorganise the DOM around them
	initStepTransitions(); // Prepare stagger timings for text panels
	initIntersection(); // Initialise the scrolly triggers
	initStyles(); // Add a stylesheet with required styles
	initStoryTransitions(); // Animate handoff between story sections
}
init();
