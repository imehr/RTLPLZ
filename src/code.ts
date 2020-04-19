
Array.prototype["swapItems"] = function(a: number, b: number) {
  this[a] = this.splice(b, 1, this[a])[0];
  return this;
};

function isParabicLTR(character: string) {
  return character.match(/[\u06f0-\u06f9]|[\u0660-\u0669]/g);
}
function isParabic(character: string) {
  return character.match(/(?!\u0020)[\u0600-\u08bd\s]|[\ufe70-\ufefc]/g);
}
function isSpecial(character: string) {
  return character.match(/[\u064b-\u065f]|[\u06D4-\u06DC]|[\u06DF-\u06E8]|[\u06EA-\u06ED]/g);
}
function textLayers(selection) {
  return selection.filter((node) => node.type === "TEXT");
}
function swapSpecialChars(line) {
  let result = line;
  result.forEach((char, index) => {
    if (isSpecial(char)) {
      result.swapItems(index, index - 1);
    }
  });
  return result;
}

function revertText(string: string): string {
  let lines = string.split("\n").map(line =>
    swapSpecialChars(line.split(""))
      .join("")
      .split(" ")
      .reduce((res, word) => {
        const lastItem = res[res.length - 1];
        const revertedCurrent = word
          .split("")
          .reverse()
          .join("");
        if (isParabic(word.trim()) && !isParabicLTR(word.trim())) {
          return [...res, revertedCurrent];
        } else {
          if (!lastItem) {
            return [...res, word];
          } else if (!isParabic(lastItem) || isParabicLTR(lastItem)) {
            return [...res.slice(0, res.length - 1), lastItem + " " + word];
          }
          return [...res, word];
        }
      }, [])
      .reverse()
      .join(" ")
  );
  return lines.join("\n");
}
function prepareForWrap(string: string, tempNode) {
  tempNode.x = 10000;
  tempNode.y = 10000;
  tempNode["textAutoResize"] = "HEIGHT";
  tempNode["opacity"] = 0;
  let tempNodeInitialHeight = tempNode["height"];
  tempNode["characters"] = "";
  return string
    .split("\n")
    .map(line =>
      line
        .replace(/\u0020+$/g, "")
        .replace(/\r?\n|\r/g, " ")
        .split(" ")
        .reduce((res, word) => {
          const currentLine = res.lastIndexOf("\n") > -1 ? res.slice(res.lastIndexOf("\n") + 1) : res;
          tempNode["characters"] = [...currentLine, word].join(" ");
          if (tempNode.height > tempNodeInitialHeight) {
            tempNode["characters"] = word;
            return [...res.filter((w, i) => !(w === "\n" && i + 1 === res.length)), "\n", word];
          }
          return [...res, word];
        }, [])
        .join(" ")
        .replace(/\u0020\n/g, "\n")
    )
    .join("\n");
}

async function setLayerText(node: BaseNode, text: string) {
  await loadFonts(node);
  node["characters"] = text;
  return text;
}

async function loadFonts(node: BaseNode) {
  if (node["fontName"] === figma["mixed"]) {
    let len = node["characters"]["length"];
    for (let i = 0; i < len; i++) {
      await figma.loadFontAsync(node["getRangeFontName"](i, i + 1));
    }
  } else {
    await figma.loadFontAsync(node["fontName"]);
  }
}

async function resetLayers(selection: PageNode["selection"]) {
  for (let node of selection) {
    await loadFonts(node);
    node["characters"] = node.getPluginData("originalText");
    try {
      node.setRelaunchData({});
    } catch (e) {}
  }
  return;
}

function handleUI({ type, payload }) {
  switch (type) {
    case "input":
      const node = figma.currentPage.selection[0];
      node.name = payload;
      node.setPluginData("originalText", payload);
      if (node["characters"] && isParabic(node["characters"][0]) && node["textAlignHorizontal"] === "LEFT") node["textAlignHorizontal"] = "RIGHT";
      if (!payload || !payload.trim()) {
        setLayerText(node, "");
      } else {
        if (node["textAutoResize"] === "WIDTH_AND_HEIGHT") {
          setLayerText(node, revertText(payload));
        } else {
          let tempNode = node.clone();
          tempNode["opacity"] = 0;
          setLayerText(tempNode, payload.split("")[0]).then(() => {
            let lines = prepareForWrap(payload, tempNode);
            setLayerText(node, revertText(lines)).then(() => {
              tempNode.remove();
            });
          });
        }
      }
      try {
        node.setRelaunchData({
          ui: "",
          reset: "",
          ...(node["textAutoResize"] !== "WIDTH_AND_HEIGHT" ? { wrap: "" } : {})
        });
      } catch (e) {}
      break;
    default:
      break;
  }
}

function checkSelection() {
  const node = figma.currentPage.selection[0];
  if (node && node.type === "TEXT") {
    figma.ui.postMessage({
      type: "text",
    });
  }
  figma.ui.postMessage({
    type: "selectionCount",
    msg: figma.currentPage.selection.filter((node) => node.type === "TEXT").length,
  });
}
let node;
if (textLayers(figma.currentPage.selection).length && figma.command !== "ui") {
  switch (figma.command) {
    case "reset":
      resetLayers(figma.currentPage.selection).then(() => {
        figma.closePlugin("Reseted to original");
      });
      break;
    case "revert":
      for (const node of figma.currentPage.selection) {
        if (node.type === "TEXT") {
          let payload = node["characters"];
          node.setPluginData("originalText", payload);
          if (node["textAutoResize"] === "WIDTH_AND_HEIGHT") {
            setLayerText(node, revertText(payload));
          } else {
            let tempNode = node.clone();
            tempNode.resize(tempNode.width - 15, tempNode.height);
            tempNode["opacity"] = 0;
            setLayerText(tempNode, payload.split("")[0]).then(() => {
              let lines = prepareForWrap(payload, tempNode);
              node["characters"] = revertText(lines);
              tempNode.remove();
            });
          }
          try {
            node.setRelaunchData({
              ui: "",
              reset: "",
              ...(node["textAutoResize"] !== "WIDTH_AND_HEIGHT" ? { wrap: "" } : {}),
            });
          } catch (e) {}
        }
      }
      if (textLayers(figma.currentPage.selection)) {
        figma.closePlugin("Layer" + (figma.currentPage.selection.filter(n => n.type === "TEXT").length > 1 ? "s " : " ") + "Updated");
      }
      figma.closePlugin("");
      break;
    case "wrap":
      node = figma.currentPage.selection[0];
      let tempNode = node.clone();
      const originalText = node.getPluginData("originalText") || revertText(node["characters"]);
      tempNode["opacity"] = 0;
      tempNode.resize(tempNode.width - 15, tempNode.height);
      setLayerText(tempNode, originalText.split("")[0]).then(() => {
        let lines = prepareForWrap(originalText, tempNode);
        node["characters"] = revertText(lines);
        tempNode.remove();
      });

      try {
        node.setRelaunchData({
          ui: "",
          reset: "",
          ...(node["textAutoResize"] !== "WIDTH_AND_HEIGHT" ? { wrap: "" } : {}),
        });
      } catch (e) {}
      figma.closePlugin("Text Lines Updated");
      break;
    default:
      figma.closePlugin();
      break;
  }
} else {
  if (figma.command === "ui") {
    figma.showUI(__html__, { width: 380, height: 280 });
    checkSelection();
  } else {
    figma.closePlugin("Select text layer(s) with RTL characters and run again | Alt + Ctrl + P");
  }
}

figma.ui.onmessage = handleUI;
figma.on("selectionchange", () => {
  checkSelection();
});
