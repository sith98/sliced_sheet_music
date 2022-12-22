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
    const margin = parseInt(document.querySelector("#margin").value) || 10;
    const maxScaling = parseFloat(document.querySelector("#max-scaling").value) || 0;
    return { title, margin, maxScaling };
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
    console.log(state);
};

const stateToImpliedState = state => {
    const config = getConfig();
    return {
        layout: layoutImages(imagesToDpImages(state.images), getRelativePageHeight(config.margin), config.maxScaling),
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
            images: [...state.images, image],
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
        images: state.images.filter(image => image.id !== id),
    }
}
const moveImage = (id, by) => state => {
    const index = state.images.findIndex(image => image.id === id);
    const image = state.images[index];
    const newImages = state.images.slice();
    newImages.splice(index, 1);
    const newIndex = Math.max(Math.min(index + by, state.images.length - 1), 0);
    newImages.splice(newIndex, 0, image);
    return { ...state, images: newImages };
}
const setAllowWrap = (id, allowWrap) => state => {
    return {
        ...state,
        images: state.images.map(image => {
            if (image.id === id) {
                return { ...image, allowWrap };
            }
            return image;
        })
    }
}
const clearImages = () => state => {
    return {
        ...state,
        images: [],
    }
};
const doNothing = () => state => state;


// render
const mapImageToHtml = image => {
    const div = document.createElement("div");
    div.classList.add("image-item")
    const removeButton = document.createElement("button");
    removeButton.innerText = "Remove";
    removeButton.addEventListener("click", () => updateState(removeImage(image.id)));

    const allowWrapButton = document.createElement("button");
    allowWrapButton.innerText = image.allowWrap ? "Page Break" : "No Page Break";
    allowWrapButton.addEventListener("click", () => updateState(setAllowWrap(image.id, !image.allowWrap)))

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
        const elements = state.images.map(mapImageToHtml);
        for (const el of elements) {
            imageOutput.appendChild(el);
        }
    }
    document.querySelector("#render").innerText = `Render ${impliedState.layout.length} Pages`;
}

// I/O
const loadImg = (item) => new Promise((resolve, reject) => {
    var blob = item.getAsFile();
    var reader = new FileReader();
    reader.onload = function (event) {
        const img = document.createElement("img");
        img.onload = () => {
            resolve(img);
        }
        img.src = event.target.result;
    };
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

const layoutImages = (dpImages, pageHeight, maxScaling) => {
    if (dpImages.length === 0) return [];
    const dp = [];
    for (let i = 0; i < dpImages.length; i++) {
        dp.push({ cost: Infinity, pageN: 0 });
    }
    dp[0].cost = computePageCost(dpImages[0].height, pageHeight, maxScaling);
    dp[0].pageN = 1;
    for (let i = 1; i < dpImages.length; i++) {
        let currentHeight = 0;
        let currentN = 0;
        for (let j = i; j >= 0; j--) {
            currentHeight += dpImages[j].height;
            currentN += 1;
            const currentCost = computePageCost(currentHeight, pageHeight, maxScaling);
            const previousCost = j === 0 ? 0 : dp[j - 1].cost;
            const cost = currentCost + previousCost;
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

const computePageCost = (imagesHeight, pageHeight, maxScaling) => {
    console.log(maxScaling);
    const tooLarge = imagesHeight > pageHeight;
    const blankSpaceCost = tooLarge ? 1 - pageHeight / imagesHeight : 1 - imagesHeight / pageHeight;
    const scalingCost = tooLarge && imagesHeight / pageHeight > maxScaling ? 1_000_000 : 0;
    return blankSpaceCost + scalingCost;
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
const renderPdf = (images, { title, margin = 20, maxScaling = 1.5 }) => {
    const layout = layoutImages(imagesToDpImages(images), getRelativePageHeight(margin), maxScaling);
    const pages = groupByPage(images, layout);

    const doc = jspdf.jsPDF();
    const width = doc.getPageWidth() - 2 * margin;
    const height = doc.getPageHeight() - 2 * margin;

    console.log(pages);
    for (let i = 0; i < pages.length; i++) {
        const pageImages = pages[i];
        renderPage(doc, pageImages, width, height, margin, true);
        if (i < pages.length - 1) {
            console.log("add page")
            doc.addPage();
        }
    }
    doc.save(`${title}.pdf`);
};
const renderPage = (doc, pageImages, width, height, margin, withPadding = false) => {
    const imagesTotalHeight = pageImages.reduce((s, image) => s + image.img.height / image.img.width * width, 0);
    const scale = imagesTotalHeight < height ? 1 : height / imagesTotalHeight;
    const xOffset = 0.5 * (width - width * scale);
    const padding = withPadding && imagesTotalHeight < height ? (height - imagesTotalHeight) / (pageImages.length - 1) : 0;
    console.log(imagesTotalHeight, height, pageImages.length, padding)
    let y = 0;
    for (const image of pageImages) {
        const img = image.img;
        const aspectRatio = img.height / img.width;
        const scaledImageHeight = width * aspectRatio * scale;
        doc.addImage(img.src, "png", margin + xOffset, y + margin, width * scale, scaledImageHeight);
        y += scaledImageHeight + padding;
    }
}


// initialization
const main = () => {
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
    ["#title", "#margin", "#max-scaling"].forEach(id => document.querySelector(id).addEventListener("change", () => updateState(doNothing())));
    updateState(doNothing());
};

window.addEventListener("load", main);