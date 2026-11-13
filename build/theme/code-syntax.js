/*
 * Code Syntax theme for PenguinMod
 *
 * Turns blocks into outlined squares and rewrites their labels into a
 * pseudo-language that reads like source code. Everything is installed on
 * Blockly's shared prototypes, so extension and custom blocks pick up the
 * theme automatically without any per-block configuration.
 */
(function () {
  "use strict";

  if (window.__pmCodeSyntaxTheme) return;
  window.__pmCodeSyntaxTheme = true;

  document.documentElement.classList.add("cs-theme");

  /* ------------------------------------------------------------------ *
   * Block labels -> pseudo-language
   * ------------------------------------------------------------------ */

  var LABELS = {
    // Events
    "when green flag clicked": "onFlag()",
    "when this sprite clicked": "onClick()",
    "when stage clicked": "onStageClick()",
    "when I start as a clone": "onClone()",
    "when I receive": "on ",
    "when backdrop switches to": "onBackdrop ",
    "when timer >": "onTimer >",
    "when loudness >": "onLoudness >",
    broadcast: "emit ",
    "broadcast and wait": "emit ",
    "and wait": "await",
    // Motion
    move: "mv(",
    steps: ")",
    turn: "rot(",
    degrees: ")",
    clockwise: "cw",
    counterclockwise: "ccw",
    "point in direction": "face ",
    "point towards": "face ",
    "go to x:": "x =",
    "y:": "y =",
    "go to": "goto ",
    glide: "glide ",
    "secs to x:": "s -> x =",
    "change x by": "x += ",
    "set x to": "x = ",
    "change y by": "y += ",
    "set y to": "y = ",
    "x position": "x",
    "y position": "y",
    direction: "dir",
    "set rotation style": "rotation =",
    "if on edge, bounce": "bounce()",
    // Looks
    say: "say ",
    think: "think ",
    for: "for",
    seconds: "s",
    show: "show()",
    hide: "hide()",
    "set size to": "size = ",
    "change size by": "size += ",
    size: "size",
    "switch costume to": "costume = ",
    "switch backdrop to": "backdrop = ",
    "next costume": "costume++",
    "next backdrop": "backdrop++",
    set: "set",
    "effect to": "effect = ",
    change: "change",
    "effect by": "effect += ",
    "clear graphic effects": "effects = 0",
    "change transparency by": "alpha += ",
    "set transparency to": "alpha = ",
    "change ghost effect by": "alpha += ",
    "ghost effect": "alpha",
    "set tint color to": "tint = ",
    layers: "layers",
    "go to front": "front",
    "go to back": "back",
    "go forward": "fwd",
    "go backward": "back",
    "costume #": "costume#",
    "costume name": "costumeName",
    "backdrop #": "backdrop#",
    "backdrop name": "backdropName",
    // Sound
    "start sound": "play ",
    "play sound": "play ",
    "until done": "untilDone",
    "stop all sounds": "stopSounds()",
    "change volume by": "vol += ",
    "set volume to": "vol = ",
    volume: "vol",
    "clear sound effects": "sndEffects = 0",
    "play all sounds": "playAll()",
    "play note": "note ",
    "rest for beats": "rest ",
    beats: "beats",
    "set instrument to": "instrument = ",
    "change tempo by": "tempo += ",
    "set tempo to": "tempo = ",
    tempo: "tempo",
    // Control
    wait: "wait ",
    repeat: "repeat(",
    forever: "forever()",
    if: "if ",
    then: "",
    else: "else",
    "wait until": "await ",
    "repeat until": "loop_until ",
    stop: "stop ",
    "create clone of": "clone ",
    "delete this clone": "delete clone",
    // Sensing
    touching: "touching ",
    "distance to": "dist ",
    ask: "input ",
    answer: "answer",
    "key pressed?": "keyPressed?",
    "mouse down?": "mouseDown()",
    "mouse x": "mouseX",
    "mouse y": "mouseY",
    "set drag mode": "drag = ",
    loudness: "loudness",
    timer: "timer",
    "reset timer": "resetTimer()",
    of: "of",
    current: "current",
    // Operators
    "pick random": "rand ",
    join: "join ",
    letter: "letter ",
    "length of": "len ",
    contains: "contains",
    mod: "%",
    round: "round",
    abs: "abs",
    floor: "floor",
    ceiling: "ceil",
    sqrt: "sqrt",
    // Variables / lists
    "show variable": "showVar ",
    "hide variable": "hideVar ",
    add: "push ",
    delete: "del",
    "delete all of": "clear ",
    insert: "insert ",
    "replace item": "setItem",
    item: "item",
    "item # of": "indexOf",
    "show list": "showList ",
    "hide list": "hideList ",
    // Pen
    "pen down": "penDown()",
    "pen up": "penUp()",
    clear: "clear()",
    stamp: "stamp()"
  };

  // Unknown (for example extension) labels still read as identifiers.
  function fallbackLabel(text) {
    if (!/\s/.test(text)) return text;
    return text.replace(/\s+/g, "_");
  }

  function pseudoLabel(text) {
    if (typeof text !== "string" || !text) return text;
    // Blockly stores non-breaking spaces inside field text.
    var key = text.replace(/\s+/g, " ").trim();
    if (!key) return text;

    if (Object.prototype.hasOwnProperty.call(LABELS, key)) {
      return LABELS[key];
    }
    var lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LABELS, lower)) {
      return LABELS[lower];
    }
    return fallbackLabel(text);
  }

  /* ------------------------------------------------------------------ *
   * Blocky geometry -> square outlines
   * ------------------------------------------------------------------ */

  function flattenBlocks(Blockly) {
    var B = Blockly.BlockSvg;

    B.CORNER_RADIUS = 0;
    B.NOTCH_WIDTH = 0;
    B.NOTCH_HEIGHT = 0;
    B.NOTCH_START_PADDING = 0;
    B.STATEMENT_INPUT_INNER_SPACE = 0;
    var inputShape =
      "m 0,0 h " + B.INPUT_SHAPE_SQUARE_WIDTH +
      " v " + B.INPUT_SHAPE_HEIGHT +
      " h -" + B.INPUT_SHAPE_SQUARE_WIDTH + " z";
    B.INPUT_SHAPE_SQUARE = inputShape;
    B.INPUT_SHAPE_HEXAGONAL = inputShape;
    B.INPUT_SHAPE_HEXAGONAL_WIDTH = B.INPUT_SHAPE_SQUARE_WIDTH;
    B.INPUT_SHAPE_ROUND = inputShape;
    B.INPUT_SHAPE_ROUND_WIDTH = B.INPUT_SHAPE_SQUARE_WIDTH;

    // Square corners and no connector notches.
    B.TOP_LEFT_CORNER_START = "m 0,0";
    B.TOP_LEFT_CORNER = "h 0";
    B.TOP_RIGHT_CORNER = "h 0";
    B.BOTTOM_RIGHT_CORNER = "h 0";
    B.BOTTOM_LEFT_CORNER = "h 0";
    B.INNER_TOP_LEFT_CORNER = "h 0";
    B.INNER_BOTTOM_LEFT_CORNER = "h 0";
    B.NOTCH_PATH_LEFT = "h 0";
    B.NOTCH_PATH_RIGHT = "h 0";

    // Hats become plain rectangles too.
    B.START_HAT_PATH = "h 0";
    B.TOP_LEFT_CORNER_DEFINE_HAT = "h 0";
    B.TOP_RIGHT_CORNER_DEFINE_HAT = "h 0";

    // Reporters lose their round/hexagonal ends.
    var squareGetOutputShape = function () {
      return Blockly.OUTPUT_SHAPE_SQUARE;
    };
    B.prototype.getOutputShape = squareGetOutputShape;

    // Draw outline-only blocks. Wrapping updateColour means every block,
    // including extension blocks and shadow blocks, is restyled.
    var originalUpdateColour = B.prototype.updateColour;
    B.prototype.updateColour = function () {
      originalUpdateColour.call(this);
      var path = this.svgPath_;
      if (!path) return;

      var colour;
      try {
        colour = this.isShadow() && this.parentBlock_
          ? this.parentBlock_.getColour()
          : this.getColour();
      } catch (e) {
        colour = "#575e75";
      }

      path.setAttribute("fill", "none");
      path.setAttribute("fill-opacity", "0");
      path.setAttribute("stroke", colour || "#575e75");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linejoin", "miter");

      if (this.inputList) {
        for (var i = 0; i < this.inputList.length; i++) {
          var outline = this.inputList[i].outlinePath;
          if (outline) {
            outline.setAttribute("fill", "none");
            outline.setAttribute("stroke", this.getColourTertiary());
            outline.setAttribute("stroke-width", "1");
          }
        }
      }
    };
  }

  function installText(Blockly) {
    var originalDisplayText = Blockly.Field.prototype.getDisplayText_;
    Blockly.Field.prototype.getDisplayText_ = function () {
      var text = originalDisplayText.call(this);
      if (typeof text !== "string") return text;

      // Labels (keywords, block names, extension block text) get the
      // pseudo-language. Values (numbers, variables, dropdown choices) are
      // left alone, apart from the few code keywords in LABELS.
      if (this instanceof Blockly.FieldLabel) {
        return pseudoLabel(text);
      }
      if (this instanceof Blockly.FieldDropdown) {
        return LABELS[text] !== undefined ? LABELS[text] : text;
      }
      return text;
    };
  }

  function refreshBlock(block) {
    // Re-render every field so the pseudo language and its width are applied
    // to blocks that were already on the workspace when the theme loaded.
    try {
      var inputs = block.inputList || [];
      for (var i = 0; i < inputs.length; i++) {
        var fields = inputs[i].fieldRow || [];
        for (var j = 0; j < fields.length; j++) {
          if (fields[j].render_) fields[j].render_();
        }
      }
      block.render();
    } catch (e) {
      /* a single stubborn block should not break the theme */
    }
  }

  function rerender(Blockly) {
    try {
      var workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
      if (!workspace) return;
      var blocks = workspace.getAllBlocks(false) || [];
      for (var i = 0; i < blocks.length; i++) {
        refreshBlock(blocks[i]);
      }
      var flyout = workspace.getFlyout && workspace.getFlyout();
      var flyoutWorkspace = flyout && flyout.getWorkspace && flyout.getWorkspace();
      if (flyoutWorkspace) {
        var flyoutBlocks = flyoutWorkspace.getAllBlocks(false) || [];
        for (var j = 0; j < flyoutBlocks.length; j++) {
          refreshBlock(flyoutBlocks[j]);
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  function install(Blockly) {
    if (!Blockly || !Blockly.BlockSvg || !Blockly.Field) return false;
    if (Blockly.__pmCodeSyntaxInstalled) return true;

    try {
      flattenBlocks(Blockly);
      installText(Blockly);
      Blockly.__pmCodeSyntaxInstalled = true;
    } catch (e) {
      if (window.console && console.warn) {
        console.warn("[code-syntax-theme] failed to install", e);
      }
      return false;
    }

    // Blocks may already exist if the theme loaded late.
    rerender(Blockly);
    setTimeout(function () {
      rerender(Blockly);
    }, 1500);
    return true;
  }

  function findBlockly() {
    // In PenguinMod's build window.ScratchBlocks is the real scratch-blocks
    // instance; window.Blockly is only a small compatibility stub.
    var candidates = [window.ScratchBlocks, window.Blockly];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (candidate && candidate.BlockSvg && candidate.Field && candidate.FieldLabel) {
        return candidate;
      }
    }
    return null;
  }

  if (install(findBlockly())) return;

  var attempts = 0;
  var timer = setInterval(function () {
    attempts++;
    if (install(findBlockly()) || attempts > 600) {
      clearInterval(timer);
    }
  }, 100);
})();
