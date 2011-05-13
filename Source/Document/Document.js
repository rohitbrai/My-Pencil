/**
 * Contains utility functions to avoid duplication  
 */
function PencilDom(dom) {
  this.dom = dom;
}
PencilDom.prototype.createProperty = function(name, value) {
  var propertyNode = this.createElement("Property");
    propertyNode.setAttribute("name", name);
    propertyNode.appendChild(dom.createTextNode(value));
  return propertyNode;
};
PencilDom.prototype.createElement = function(element) {
  return this.dom.createElementNS(PencilNamespaces.p, element);
};
PencilDom.prototype.createChild = function(element) {
  var child = this.createElement(element);
  this.dom.documentElement.appendChild(child);
  return child;
};


function PencilDocument() {
    this.properties = {};
    this.pages = [];
    
    
    function addDocumentProperties(pd) {
      var propertyContainerNode = pd.createChild("Properties");
      var property = null;
      for (property in this.properties) {
        var propertyNode = pd.createProperty(property, this.properties[property].toString());
        propertyContainerNode.appendChild(propertyNode);
      }
    }
    
    function addDocumentPages(pd) {
      var pageContainerNode = pd.createChild("Pages");
      var page = null;
      for (page in this.pages) {
          pageContainerNode.appendChild(this.pages[i].toNode(dom));
      }
    }
    
    this.toDom = function() {
      var dom = document.implementation.createDocument(PencilNamespaces.p, "Document", null);
      var pd = new PencilDom(dom);
      addDocumentProperties(pd);
      addDocumentPages(pd);
      return dom;
    };
    
}

PencilDocument.prototype.addPage = function (page) {
    this.pages[this.pages.length] = page;
};
PencilDocument.prototype.getPageById = function (id) {
    var i = null;
    for (i in this.pages) {
        if (this.pages[i].properties.id === id) {
          return this.pages[i];
        }
    }

    return null;
};
PencilDocument.prototype.getPageByFid = function (fid) {
    var i = null;
    for (i in this.pages) {
        if (this.pages[i].properties.fid === fid) {
          return this.pages[i];
        }
    }

    return null;
};
PencilDocument.prototype.getFirstPageByName = function (name) {
    var i = null;
    for (i in this.pages) {
        if (this.pages[i].properties.name === name) {
          return this.pages[i];
        }
    }

    return null;
};


function Page(doc) {
    if (!doc) {
      throw Util.getMessage("attempting.to.construct.a.page.outside.the.scope.of.a.valid.document");
    }
    this.doc = doc;
    this.properties = {};
    this.contentNode = null;
    this.bg = {
        lastId: null,
        lastUpdateTimestamp: 0
    };
    this.rasterizeCache = null;
}
Page.prototype.validateLoadedData = function () {
    this.properties.dimBackground = (this.properties.dimBackground == "true");
};
Page.prototype.toNode = function (dom, noContent) {
    var pd = new PencilDom(dom, this);
    var pageNode = pd.createElement("Page");
    
    var propertyContainerNode = pd.createElement("Properties");
    pageNode.appendChild(propertyContainerNode);

    for (property in this.properties) {
      var propertyNode = null;
      // The user cannot save the document if 
      // there is a page that does not have a name
      // By default the first page of a new document
      // is untitled and the name is missing. 
      if(property === 'name' && !this.properties[property]) {
         propertyNode = pd.createProperty(property, Util.message("untitled.page"));
      }  else {
           propertyNode = pd.createProperty(property, this.properties[property].toString());  
      }
      propertyContainerNode.appendChild(propertyNode);
    }
    
    if (this.contentNode && !noContent) {
        var contentNode = pd.createElement("p:Content");
        for (var i = 0; i < this.contentNode.childNodes.length; i ++) {
            var node = this.contentNode.childNodes[i];
            contentNode.appendChild(dom.importNode(node, true));
        }

        pageNode.appendChild(contentNode);
    }

    return pageNode;
};
Page.prototype.equals = function (page) {
    if (page === null) return false;
    return page.constructor === Page && page.properties.id === this.properties.id;
};
Page.prototype.getBackgroundPage = function () {
    var bgPageId = this.properties.background;
    if (!bgPageId) return null;

    return this.doc.getPageById(bgPageId);
};

Page._validateBackgroundInternal = function (list, page) {
    var newList = [];
    for (var i in list) {
        var p = list[i];
        if (p.equals(page)) throw Util.getMessage("cyclic.ref.found.in.background.settings");
        newList.push(p);
    }
    var nextBg = page.getBackgroundPage();
    if (nextBg) {
        newList.push(page);
        Page._validateBackgroundInternal(newList, nextBg);
    }
};
Page.prototype.validateBackgroundSetting = function () {
    var page = this.getBackgroundPage();
    if (!page) return;

    Page._validateBackgroundInternal([this], page);
};
Page.prototype.canSetBackgroundTo = function (page) {
    try {
        Page._validateBackgroundInternal([this], page);
        return true;
    } catch (e) { return false; }
};

Page.prototype.isBackgroundValid = function () {
    var page = this.getBackgroundPage();
    if (!page) return (this.bgToken ? false : true);
    if (!page.isRasterizeDataCacheValid()) return false;
    if (!page.rasterizeDataCache || (page.rasterizeDataCache.token != this.bgToken)) return false;

    return true;
};

Page.prototype.ensureBackground = function (callback) { // callback: function() {} called when done
    if (Config.get("object.snapping.background") === null) {
        Config.set("object.snapping.background", true);
    }

    this._view.canvas.snappingHelper.updateSnappingDataFromBackground(this.getBackgroundPage(), Config.get("object.snapping.background") === false);
    this._view.canvas.setDimBackground(this.properties.dimBackground);
    var page = this.getBackgroundPage();
    if (this.isBackgroundValid()) {
        if (callback) callback();
        return;
    }
    this.rasterizeDataCache = null;
    if (!page) {
        this.bgToken = null;
        this._view.canvas.setBackgroundImageData(null);

        if (callback) callback();
        return;
    }
    var thiz = this;
    page.getRasterizeData(function (rasterizeData) {
        thiz.bgToken = rasterizeData.token;
        //alert([page.properties.name, rasterizeData.image.width, rasterizeData.image.height]);
        try {
            thiz._view.canvas.setBackgroundImageData(rasterizeData.image, thiz.properties.dimBackground);
        } catch (e) {
            Console.dumpError(e);
        }

        if (callback) callback();
    });
};
Page.prototype.getRasterizeData = function (callback) {
    if (this.isRasterizeDataCacheValid()) {
        callback(this.rasterizeDataCache);

        return;
    }
    var thiz = this;
    this.ensureBackground(function () {
        Pencil.rasterizer.rasterizePageToUrl(thiz, function (imageData) {
            thiz.rasterizeDataCache = {
                token: thiz._generateToken(),
                image: imageData
            };
            callback(thiz.rasterizeDataCache);
        });
    });
};
Page.prototype.isRasterizeDataCacheValid = function () {
    return this.rasterizeDataCache && this.isBackgroundValid();
};
Page.prototype._generateToken = function () {
    return this.properties.id + "@" + (new Date().getTime()) + "_" + Math.round(Math.random() * 1000);
};
Page.prototype.generateFriendlyId = function (usedFriendlyIds) {
    var baseName = this.properties.name.replace(/[^a-z0-9 ]+/gi, "").replace(/[ ]+/g, "_").toLowerCase();
    var name = baseName;
    var seed = 1;

    while (usedFriendlyIds.indexOf(name) >= 0) {
        name = baseName + "_" + (seed ++);
    }

    usedFriendlyIds.push(name);
    return name;
};




