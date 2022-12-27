let state = {
    images: [],
    counter: 0,
};
let impliedState = {
    layout: [],
};

// update

const getConfig = () => {
    const title = document.querySelector("#title").value;
    const margin = Math.max(0, parseIntDefault(document.querySelector("#margin").value));
    const maxScaling = Math.max(0, parseFloatDefault(document.querySelector("#max-scaling").value));
    const pageLimit = Math.max(0, parseIntDefault(document.querySelector("#page-limit").value));
    const optimizeWorstPage = document.querySelector("#optimize-worst").checked;
    const minimizeHeightDifference = document.querySelector("#height-diff").checked;
    return { title, margin, maxScaling, pageLimit, optimizeWorstPage, minimizeHeightDifference };
}
const parseIntDefault = (input, defaultValue = 0) => {
    const result = parseInt(input);
    return Number.isNaN(result) ? defaultValue : result;
}
const parseFloatDefault = (input, defaultValue = 0) => {
    const result = parseFloat(input);
    return Number.isNaN(result) ? defaultValue : result;
}

const updateState = action => {
    const prev = state;
    const prevImplied = impliedState;
    const result = action(state);
    if (result instanceof Array) {
        state = result[0];
        impliedState = stateToImpliedState(state);
        updateHtml(prev, state, prevImplied, impliedState);
        result[1]();
    } else {
        state = result;
        impliedState = stateToImpliedState(state);
        updateHtml(prev, state, prevImplied, impliedState);
    }
    lsStore(state);
    console.log(state);
};

const stateToImpliedState = state => {
    const config = getConfig();
    return {
        layout: layoutImagesWithPageLimit(
            imagesToDpImages(state.images),
            getRelativePageHeight(config.margin),
            config
        ),
    }
}

const addImage = img => state => {
    const image = {
        img,
        allowWrap: true,
        id: state.counter
    }
    return [
        {
            ...state,
            images: resetWordWrapOfLastImage([...state.images, image]),
            counter: state.counter + 1,
        },
        () => {
            const div = document.querySelector("#images")
            div.scrollTop = div.scrollHeight;
        }
    ]
}
const removeImage = id => state => {
    return {
        ...state,
        images: resetWordWrapOfLastImage(state.images.filter(image => image.id !== id)),
    }
}
const moveImage = (id, by) => state => {
    const index = state.images.findIndex(image => image.id === id);
    const image = state.images[index];
    const newImages = state.images.slice();
    newImages.splice(index, 1);
    const newIndex = Math.max(Math.min(index + by, state.images.length - 1), 0);
    newImages.splice(newIndex, 0, image);
    return { ...state, images: resetWordWrapOfLastImage(newImages) };
}
const setAllowWrap = (id, allowWrap) => state => {
    return {
        ...state,
        images: resetWordWrapOfLastImage(state.images.map(image => {
            if (image.id === id) {
                return { ...image, allowWrap };
            }
            return image;
        })),
    }
}
const resetWordWrapOfLastImage = images => {
    if (images.length === 0) {
        return images;
    }
    return [
        ...images.slice(0, images.length - 1),
        {
            ...images[images.length - 1],
            allowWrap: true,
        }
    ]
}
const clearImages = () => state => {
    return {
        ...state,
        images: [],
    }
};
const loadFromLocalStore = lsState => state => {
    return lsState;
}
const doNothing = () => state => state;


// render
const mapImageToHtml = (image, isLastImage = false) => {
    const div = document.createElement("div");
    div.classList.add("image-item")
    const removeButton = document.createElement("button");
    removeButton.innerText = "Remove";
    removeButton.addEventListener("click", () => updateState(removeImage(image.id)));

    const allowWrapButton = document.createElement("button");
    allowWrapButton.innerText = image.allowWrap ? "Page Break" : "No Page Break";
    allowWrapButton.addEventListener("click", () => updateState(setAllowWrap(image.id, !image.allowWrap)))
    allowWrapButton.disabled = isLastImage;

    const upButton = document.createElement("button");
    upButton.innerText = "Move Up";
    upButton.addEventListener("click", () => updateState(moveImage(image.id, -1)));

    const downButton = document.createElement("button");
    downButton.innerText = "Move Down";
    downButton.addEventListener("click", () => updateState(moveImage(image.id, +1)));

    const buttons = document.createElement("div");
    buttons.classList.add("buttons");
    buttons.appendChild(removeButton);
    buttons.appendChild(allowWrapButton);
    buttons.appendChild(upButton);
    buttons.appendChild(downButton);

    div.appendChild(buttons);
    div.appendChild(image.img);
    return div;
}

const updateHtml = (prev, state, prevImplied, impliedState) => {
    const imageOutput = document.querySelector("#images");

    if (prev.images !== state.images) {
        imageOutput.innerHTML = "";
        const elements = state.images.map((image, index) => mapImageToHtml(image, index === state.images.length - 1));
        for (const el of elements) {
            imageOutput.appendChild(el);
        }
    }
    document.querySelector("#render").innerText = `Print ${state.images.length} Images on ${impliedState.layout.length} Pages`;
}

// I/O
const loadImg = (item) => new Promise((resolve, reject) => {
    var blob = item.getAsFile();
    var reader = new FileReader();
    reader.onload = (event) => {
        const img = document.createElement("img");
        img.onload = () => {
            resolve(img);
        }
        img.onerror = err => {
            reject(err);
        }
        img.src = event.target.result;
    };
    reader.onerror = err => {
        reject(err);
    }
    reader.readAsDataURL(blob);
});

// Layout
const getRelativePageHeight = margin => {
    const doc = new jspdf.jsPDF();
    const pageWidth = doc.getPageWidth() - 2 * margin;
    const pageHeight = doc.getPageHeight() - 2 * margin;
    return pageHeight / pageWidth;
};

const imagesToDpImages = images => {
    const dpImages = [];
    let currentHeight = 0;
    let n = 0;
    for (const image of images) {
        currentHeight += image.img.height / image.img.width;
        n += 1;
        if (image.allowWrap) {
            dpImages.push({ height: currentHeight, n: n });
            currentHeight = 0;
            n = 0;
        }
    }
    return dpImages;
}

const layoutImages = (dpImages, pageHeight, { maxScaling = 0, optimizeWorstPage = false, minimizeHeightDifference = false }) => {
    if (dpImages.length === 0) return [];
    const dp = [];
    for (let i = 0; i < dpImages.length; i++) {
        dp.push({ cost: Infinity, pageN: 0 });
    }
    dp[0].cost = computePageCost(dpImages[0].height, pageHeight, maxScaling, minimizeHeightDifference);
    dp[0].pageN = 1;
    for (let i = 1; i < dpImages.length; i++) {
        let currentHeight = 0;
        let currentN = 0;
        for (let j = i; j >= 0; j--) {
            currentHeight += dpImages[j].height;
            currentN += 1;
            const currentCost = computePageCost(currentHeight, pageHeight, maxScaling, minimizeHeightDifference);
            const previousCost = j === 0 ? 0 : dp[j - 1].cost;
            const cost = optimizeWorstPage ? Math.max(currentCost, previousCost) : previousCost + currentCost;
            if (cost < dp[i].cost) {
                dp[i].cost = cost;
                dp[i].pageN = currentN;
            }
        }
    }
    const pages = []
    let index = dp.length - 1;
    while (index >= 0) {
        const n = dp[index].pageN;
        let actualN = 0;
        for (let i = index - n + 1; i <= index; i++) {
            actualN += dpImages[i].n;
        }
        pages.push(actualN);
        index -= n;
    }
    pages.reverse();
    return pages;
};

const layoutImagesWithPageLimit = (dpImages, pageHeight, config = {}) => {
    const { pageLimit = 0, optimizeWorstPage = false, minimizeHeightDifference = false } = config;
    const defaultLayout = layoutImages(dpImages, pageHeight, config);
    if (pageLimit === 0 || defaultLayout.length <= pageLimit) {
        return defaultLayout;
    }
    if (dpImages.length === 0) return [];
    const dp = [];
    for (let i = 0; i < dpImages.length; i++) {
        const dpRow = [];
        for (let j = 0; j < pageLimit; j++) {
            dpRow.push({ cost: Infinity, pageN: 0 });
        }
        dp.push(dpRow);
    }

    // initialize special case: 1 page
    let currentHeight = 0;
    for (let i = 0; i < dpImages.length; i++) {
        currentHeight += dpImages[i].height;
        dp[i][0].cost = computePageCost(currentHeight, pageHeight, 0, minimizeHeightDifference);
        dp[i][0].pageN = i + 1;
    }
    for (let i = 1; i < dpImages.length; i++) {
        let currentHeight = 0;
        let currentN = 0;
        // j = 0 is handled already in the "1 page" case
        for (let j = i; j >= 1; j--) {
            currentHeight += dpImages[j].height;
            currentN += 1;
            const currentCost = computePageCost(currentHeight, pageHeight, 0, minimizeHeightDifference);
            for (let k = 2; k <= Math.min(pageLimit, i + 1); k++) {
                const previousCost = dp[j - 1][k - 1 - 1].cost;
                const cost = optimizeWorstPage ? Math.max(currentCost, previousCost) : previousCost + currentCost;
                if (cost < dp[i][k - 1].cost) {
                    dp[i][k - 1].cost = cost;
                    dp[i][k - 1].pageN = currentN;
                }
            }
        }
    }

    const pages = []
    let index = dp.length - 1;
    let k = pageLimit;
    while (index >= 0) {
        const n = dp[index][k - 1].pageN;
        let actualN = 0;
        for (let i = index - n + 1; i <= index; i++) {
            actualN += dpImages[i].n;
        }
        pages.push(actualN);
        index -= n;
        k -= 1;
    }
    pages.reverse();
    return pages;
}

const computePageCost = (imagesHeight, pageHeight, maxScaling = 0, minimizeHeightDifference = false) => {
    const tooLarge = imagesHeight > pageHeight;
    // ratio of blank space on the page
    const blankSpaceCost = tooLarge ? 1 - pageHeight / imagesHeight : 1 - imagesHeight / pageHeight;
    // relative difference of images height and page height (stronger penalty for downscaled images)
    const heightCost = Math.abs(pageHeight - imagesHeight) / pageHeight;
    const scalingCost = tooLarge && maxScaling > 0 && imagesHeight / pageHeight > maxScaling ? 1_000_000 : 0;
    if (minimizeHeightDifference) {
        return heightCost + scalingCost;
    } else {
        return blankSpaceCost + scalingCost;
    }
}

const groupByPage = (images, layout) => {
    const pages = [];
    let index = 0;
    for (const pageN of layout) {
        const page = [];
        for (let i = 0; i < pageN; i++) {
            page.push(images[index]);
            index += 1;
        }
        pages.push(page);
    }
    return pages;
}

// PDF
const renderPdf = (images, config = {}) => {
    const { title, margin = 20 } = config;
    console.log(margin);
    const layout = layoutImagesWithPageLimit(
        imagesToDpImages(images),
        getRelativePageHeight(margin),
        config
    );
    const pages = groupByPage(images, layout);

    const doc = jspdf.jsPDF();
    const width = doc.getPageWidth() - 2 * margin;
    const height = doc.getPageHeight() - 2 * margin;

    for (let i = 0; i < pages.length; i++) {
        const pageImages = pages[i];
        renderPage(doc, pageImages, width, height, margin, true);
        if (i < pages.length - 1) {
            doc.addPage();
        }
    }
    doc.save(`${title}.pdf`);
};
const renderPage = (doc, pageImages, width, height, margin, withPadding = false) => {
    const imagesTotalHeight = pageImages.reduce((s, image) => s + image.img.height / image.img.width * width, 0);
    const scale = imagesTotalHeight < height ? 1 : height / imagesTotalHeight;
    const xOffset = 0.5 * (width - width * scale);
    const nImages = pageImages.reduce((s, page) => s + (page.allowWrap ? 1 : 0), 0);
    const padding = withPadding && imagesTotalHeight < height ? (height - imagesTotalHeight) / (nImages - 1) : 0;
    let y = 0;
    for (const image of pageImages) {
        const img = image.img;
        const aspectRatio = img.height / img.width;
        const scaledImageHeight = width * aspectRatio * scale;
        doc.addImage(img.src, "png", margin + xOffset, y + margin, width * scale, scaledImageHeight);
        y += scaledImageHeight;
        if (image.allowWrap) {
            y += padding;
        }
    }
}


// local storage
const lsKey = "sliced_sheet_music"
const lsLoad = async () => {
    const lsJson = localStorage.getItem(lsKey);
    if (lsJson === null) {
        return null;
    }
    const ls = JSON.parse(lsJson);

    const images = await Promise.all(ls.images.map(image => new Promise((resolve) => {
        const img = document.createElement("img");
        img.onload = () => {
            resolve({
                img,
                allowWrap: image.allowWrap,
                id: image.id,
            });
        }
        img.src = image.src;
    })));
    return {
        counter: ls.counter,
        images,
    };
}

const lsStore = (state) => {
    const imagesLs = state.images.map(image => {
        return {
            id: image.id,
            allowWrap: image.allowWrap,
            src: image.img.src,
        };
    })
    localStorage.setItem(lsKey, JSON.stringify({
        counter: state.counter,
        images: imagesLs,
    }));
}


// initialization
const main = async () => {
    document.onpaste = async (event) => {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;
        for (const item of Object.values(items)) {
            if (item.kind === 'file') {
                const img = await loadImg(item);
                updateState(addImage(img));
            }
        }
    };
    document.querySelector("#clear").addEventListener("click", () => updateState(clearImages()));
    document.querySelector("#render").addEventListener("click", () => {
        const config = getConfig();
        renderPdf(state.images, config);
    });
    ["title", "margin", "max-scaling", "page-limit", "optimize-worst", "height-diff"].forEach(
        id => document.querySelector(`#${id}`).addEventListener("change", () => updateState(doNothing()))
    );
    const lsState = await lsLoad();
    if (lsState !== null) {
        updateState(loadFromLocalStore(lsState));
    } else {
        updateState(doNothing());
    }
    // experiment();
};

window.addEventListener("load", main);