// Global variables to store center phenotype and links
let leftPheno = null;
let rightPheno = null;
let links = [];
let pThreshold = 1;
let betaThreshold = 0;
let betaSign = 0;
let nodes = [];
let activeNode = null;
let graphData = null;
let ancestryToggle = null;
let ancestryLower = null; // Declare ancestryLower as a global variable, and use let instead of const
let betaColumn2 = null;
let pColumn2 = null;
let pThreshold2 = 1;
let comparison_on_off = false; // Variable to track if comparison mode is on
let anc1 = null;
let anc2 = null;


// Function to parse query parameters
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        ancestry: params.get('ancestry'),
        // pvalue will be given in scientific notation, and we should pull the exponent. So if it is 1e-10, we should get -10
        pvalue: parseFloat(params.get('pvalue')).toExponential().split('e')[1],
        // pvalue: params.get('pvalue'),
        leftPheno: params.get('leftPheno'),
        rightPheno: params.get('rightPheno')
    };
}

const params = getQueryParams();
leftPheno = params.leftPheno;
rightPheno = params.rightPheno;

ancestryLower = params.ancestry.toLowerCase(); // Initialize ancestryLower from the query parameter
let betaColumn = `beta.${ancestryLower}`;
let pColumn = `pval.${ancestryLower}`;
pThreshold = parseFloat(params.pvalue);

async function loadData() {
    const splitPhenotypes = ['181', '167', '170', '175'];
    let data = [];
    if (splitPhenotypes.includes(leftPheno)) {
        const file1 = `/data/node_files/${leftPheno}_1.csv`;
        const file2 = `/data/node_files/${leftPheno}_2.csv`;
        try {
            const [data1, data2] = await Promise.all([d3.csv(file1), d3.csv(file2)]);
            data = data1.concat(data2);
        } catch (error) {
            console.error(`Error loading split files for ${leftPheno}:`, error);
            return null;
        }
    } else {
        const fileName = `/data/node_files/${leftPheno}.csv`;
        try {
            data = await d3.csv(fileName);
        } catch (error) {
            console.error(`Error loading file ${fileName}:`, error);
            return null;
        }
    }

    try {
        console.log('Number of rows (left):', data.length);
        // filter the data for leftPheno and rightPheno
        data = data.filter(d => d.phe_id === leftPheno || d.phe_id === rightPheno);
        console.log('Number of rows (combined):', data.length);
        // make a set of rsids that are associated with leftPheno
        const leftRSIDs = new Set(data.filter(d => d.phe_id === leftPheno).map(d => d.rsid));
        // make a set of rsids that are associated with rightPheno
        const rightRSIDs = new Set(data.filter(d => d.phe_id === rightPheno).map(d => d.rsid));
        // take the intersection of the two sets
        const commonRSIDs = Array.from(leftRSIDs).filter(rsid => rightRSIDs.has(rsid));
        // if commonRSIDs is longer than 100, sort by chrom and take 100 evenly spaced values
        if (commonRSIDs.length > 100) {
            // sort commonRSIDs by chrom
            commonRSIDs.sort((a, b) => {
                const chromA = data.find(d => d.rsid === a).chrom;
                const chromB = data.find(d => d.rsid === b).chrom;
                return chromA - chromB;
            }
            );
            // take every nth value, where n is the length of commonRSIDs divided by 100
            const n = Math.ceil(commonRSIDs.length / 100);
            const filteredRSIDs = [];
            for (let i = 0; i < commonRSIDs.length; i += n) {
                filteredRSIDs.push(commonRSIDs[i]);
            }
            // set commonRSIDs to the filteredRSIDs
            commonRSIDs.length = 0; // Clear the original array
            commonRSIDs.push(...filteredRSIDs); // Add the filtered values
        }
        console.log('Number of common rsids:', commonRSIDs.length);

        // filter the data for the common rsids AND the left and right phenotypes
        data = data.filter(d => commonRSIDs.includes(d.rsid) && (d.phe_id === leftPheno || d.phe_id === rightPheno));
        // if the data is empty, warn the user and then close the window
        if (data.length === 0) {
            alert('No data found for the selected phenotypes.');
            window.close();
        }


        return data; // Return the data after loading
    } catch (error) {
        console.error(`Error loading file:`, error);
        return null; // Return null in case of an error
    }
}

// Call the async function and use the data when it's ready
loadData().then((data) => {
    if (data) {
        graphData = data;
        const base_ancestries = ['amr', 'eas', 'afr', 'eur','meta'];
        for (let ancestry of base_ancestries) {
            const betaColumn = `beta.${ancestry}`;
            const pColumn = `pval.${ancestry}`;
            // Filter the phe_id column to only include the leftPheno
            const leftPhenoData = data.filter(d => d.phe_id === leftPheno);

            // If the beta column contains only NaN values, remove the ancestry from the base_ancestries list
            if (leftPhenoData.every(d => isNaN(parseFloat(d[betaColumn])))) {
                base_ancestries.splice(base_ancestries.indexOf(ancestry), 1);
            }
            else {
                const rightPhenoData = data.filter(d => d.phe_id === rightPheno);
                if (rightPhenoData.every(d => isNaN(parseFloat(d[betaColumn])))) {
                    base_ancestries.splice(base_ancestries.indexOf(ancestry), 1);
                }
            }
        }

        // Define the log scale range
        const minLogP = -12; // Corresponding to 10^-12
        const maxLogP = -4;  // Corresponding to 10^-4

        // Add a p-value threshold slider with log scale and text input
        const pValueSlider = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '10px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label for="pvalue-slider" id="pvalue-label-1">Select p-value threshold:</label>
                </div>
                <input type="range" id="pvalue-slider" name="pvalue-slider" min="${minLogP}" max="${maxLogP}" step="0.1" value="${maxLogP}">
                <input type="number" id="pvalue-input" step="0.1" min="${minLogP}" max="${maxLogP}" value="${maxLogP}">
                <span id="pvalue-threshold">1e${maxLogP}</span>
            `);

        let debounceTimer;
        const updatePValueThreshold = (logP) => {
            pThreshold = Math.pow(10, logP); // Convert back to linear scale
            d3.select('#pvalue-threshold').text(`1e${logP}`);

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                if (!graphData) {
                    console.warn("Data is not loaded yet.");
                    return;
                }

                const network = initializeNetwork(graphData, betaColumn, pColumn, betaColumn2, pColumn2, comparison_on_off);
                const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData, pThreshold2, comparison_on_off);
                // const categories = filteredEdges.map(l => l.target.category);
                // const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(network.nodes, filteredEdges, graphData, network.width, network.height, leftPheno,rightPheno, network.nodeMap, comparison_on_off);

            }, 200); // 200ms debounce delay
        };

        // Initialize the slider and input with the value from the query parameter
        const initialPValue = params.pvalue || maxLogP;
        d3.select('#pvalue-slider').property('value', initialPValue);
        updatePValueThreshold(initialPValue);

        d3.select('#pvalue-slider').on('input', function () {
            const logP = this.value;
            d3.select('#pvalue-input').property('value', logP);
            updatePValueThreshold(logP);
        });

        d3.select('#pvalue-input').on('input', function () {
            const logP = this.value;
            d3.select('#pvalue-slider').property('value', logP);
            updatePValueThreshold(logP);
        });

        d3.select('#pvalue-label-1')
        .text(`Select p-value threshold for ${ancestryLower}`);

        // add a second p value slider for when a second ancestry is selected
        const pValueSlider2 = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '75px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label for="pvalue-slider2" id="pvalue-label-2">Select second p-value threshold:</label>
                </div>
                <div style="margin-top: 5px;">
                    <input type="range" id="pvalue-slider2" name="pvalue-slider2" min="${minLogP}" max="${maxLogP}" step="0.1" value="${maxLogP}">
                    <input type="number" id="pvalue-input2" step="0.1" min="${minLogP}" max="${maxLogP}" value="${maxLogP}">
                    <span id="pvalue-threshold2">1e${maxLogP}</span>
                </div>
            `);

        let debounceTimer2;
        const updatePValueThreshold2 = (logP) => {
            pThreshold2 = Math.pow(10, logP); // Convert back to linear scale
            d3.select('#pvalue-threshold2').text(`1e${logP}`);

            clearTimeout(debounceTimer2);
            debounceTimer2 = setTimeout(() => {
                if (!graphData) {
                    console.warn("Data is not loaded yet.");
                    return;
                }
                console.log('comparison_on_off:', comparison_on_off);
                const network = initializeNetwork(graphData, betaColumn, pColumn, betaColumn2, pColumn2, comparison_on_off);
                const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData, pThreshold2, comparison_on_off);
                // const categories = filteredEdges.map(l => l.target.category);
                // const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(network.nodes, filteredEdges, graphData, network.width, network.height, leftPheno,rightPheno, network.nodeMap, comparison_on_off);

                if (activeNode) {
                    console.log('Re-highlighting active node:', activeNode);
                    highlightNode(activeNode, filteredEdges, comparison_on_off);
                }
            }, 200); // 200ms debounce delay
        }

        // Initialize the slider and input with the value from the query parameter
        const initialPValue2 = maxLogP; // Default to the same value as the first slider
        d3.select('#pvalue-slider2').property('value', initialPValue2);
        d3.select('#pvalue-input2').property('value', initialPValue2);
        // updatePValueThreshold2(initialPValue2);

        d3.select('#pvalue-slider2').on('input', function () {
            const logP = this.value;
            d3.select('#pvalue-input2').property('value', logP);
            updatePValueThreshold2(logP);
        });

        d3.select('#pvalue-input2').on('input', function () {
            const logP = this.value;
            d3.select('#pvalue-slider2').property('value', logP);
            updatePValueThreshold2(logP);
        });

        // make the second slider grayed out and unclickable until a second ancestry is selected
        d3.select('#pvalue-slider2').property('disabled', true);
        d3.select('#pvalue-input2').property('disabled', true);
        d3.select('#pvalue-threshold2').style('color', 'gray');
        d3.select('#pvalue-slider2').style('opacity', 0.5);
        d3.select('#pvalue-input2').style('opacity', 0.5);

        // Add a beta threshold slider with text input
        const betaThresholdSlider = d3.select('body')
        .append('div')
        .style('position', 'absolute')
        .style('top', '150px')
        .style('left', '10px')
        .style('background', 'transparent')
        .style('padding', '10px')
        .style('color', 'white')
        .html(`
            <label for="beta-threshold-slider">Select beta threshold:</label>
            <input type="range" id="beta-threshold-slider" name="beta-threshold-slider" min="0" max="1" step="0.01" value="0">
            <input type="number" id="beta-input" step="0.01" min="0" max="1" value="0">
            <span id="beta-threshold">0</span>
        `);

        let debounceTimerBeta;
        const updateBetaThreshold = (value) => {
        betaThreshold = value;
        d3.select('#beta-threshold').text(betaThreshold);

        clearTimeout(debounceTimerBeta);
        debounceTimerBeta = setTimeout(() => {
            if (!graphData) {
                console.warn("Data is not loaded yet.");
                return;
            }

            const network = initializeNetwork(graphData, betaColumn, pColumn);
            const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData);
            // const categories = filteredEdges.map(l => l.target.category);
            // const filteredNodes = updateNodes(categories, network.nodes);

            renderNetwork(network.nodes, filteredEdges, graphData, network.width, network.height, leftPheno, rightPheno, network.nodeMap, comparison_on_off);

        }, 200); // 200ms debounce delay
        };

        // Initialize the slider and input with the value from the query parameter
        const initialBeta = 0;
        d3.select('#beta-threshold-slider').property('value', initialBeta);
        d3.select('#beta-input').property('value', initialBeta);
        updateBetaThreshold(initialBeta);
        d3.select('#beta-threshold').text(betaThreshold);

        d3.select('#beta-threshold-slider').on('input', function () {
        const value = this.valueAsNumber;
        d3.select('#beta-input').property('value', value);
        updateBetaThreshold(value);
        });

        d3.select('#beta-input').on('input', function () {
        const value = this.valueAsNumber;
        d3.select('#beta-threshold-slider').property('value', value);
        updateBetaThreshold(value);
        });


        // Create a container div for the button and info text
        const infoContainer = d3.select('body')
        .append('div')
        .style('position', 'absolute')
        .style('top', '10px')
        .style('right', '10px')
        .style('background', 'transparent')
        .style('padding', '10px')
        .style('color', 'white');

        // Add the button
        const infoButton = infoContainer.append('button')
        .text('About SNP View')
        .style('background', '#444')
        .style('color', 'white')
        .style('border', 'none')
        .style('padding', '8px 12px')
        .style('cursor', 'pointer')
        .style('border-radius', '5px')
        .on('click', () => {
            const isVisible = infoText.style('display') === 'block';
            infoText.style('display', isVisible ? 'none' : 'block');
        });

        // Add the info text (initially hidden)
        const infoText = infoContainer.append('div')
        .style('display', 'none')
        .style('margin-top', '10px') 
        .style('padding', '10px')
        .style('background', 'rgba(0, 0, 0, 0.8)')
        .style('border-radius', '5px')
        .style('max-width', '600px')
        .html(`
            <h2>SNP View</h2>
            <p>
                The nodes on the left and right are the phenotypes you selected.</p>
            <p>The nodes in the middle are the SNPs associated with both phenotypes.<br>
                These nodes are colored and ordered by the chromosome they are located on. <br>
                The chromosome also appears in the label when hovering over the node.</p>
            <p>The edges are colored based on the direction of their association, and given<br>
                a thickness based on the effect size.</p>
            <p>Selecting a second ancestry re-colors the links so that they are green if the association is the same
                direction in both ancestries, and orange if they are different directions. The p-values can be toggled independently for 
                the two ancestries</p>
            <p>Double click a phenotype to enter its node view.</p>
            </p>
        `);

        // add a download button to download data as a csv file
        const downloadButton = infoContainer.append('button')
            .text('Download Data')
            .style('display', 'block')
            .style('margin-top', '10px')
            .style('background', '#444')
            .style('color', 'white')
            .style('border', 'none')
            .style('padding', '8px 12px')
            .style('cursor', 'pointer')
            .style('border-radius', '5px')
            .on('click', () => {
                const csvString = d3.csvFormat(graphData);
                const blob = new Blob([csvString], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'data.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });

        // add a checkbox dropdown menu called compare ancestries
        const compareAncestries = d3.select('body')
            .append('div')
            
            .style('position', 'absolute')
            .style('top', '185px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <label>Select ancestry:</label>
                <div id="ancestry-checkboxes" style="border: 1px solid white; padding: 5px; max-width: 200px;">
                    ${base_ancestries.map(ancestry => `
                        <div>
                            <input type="checkbox" class="ancestry-option" value="${ancestry}" id="chk-${ancestry}">
                            <label for="chk-${ancestry}">${ancestry.toUpperCase()}</label>
                        </div>
                    `).join('\n')}
                </div>
                <p style="font-size: 12px;">(Select two to compare)</p>
            `);

        const checkbox = document.querySelector(`#chk-${ancestryLower}`);
        console.log(checkbox);
        if (checkbox) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change')); // Trigger the event so the network renders
        }

        // Listen for ancestry checkbox changes
        d3.selectAll('.ancestry-option').on('change', function () {
            const checked = d3.selectAll('.ancestry-option').nodes().filter(d => d.checked);
            
            if (checked.length > 2) {
                this.checked = false;
                alert('Please select only two ancestries.');
                return;
            }

            if (checked.length === 1) {

                // Disable the second slider
                d3.select('#pvalue-slider2').property('disabled', true);
                d3.select('#pvalue-input2').property('disabled', true);
                d3.select('#pvalue-threshold2').style('color', 'gray');
                d3.select('#pvalue-slider2').style('opacity', 0.5);
                d3.select('#pvalue-input2').style('opacity', 0.5);

                ancestryLower = checked[0].value.toLowerCase(); // Update ancestryLower when the selection changes
                console.log(`Ancestry selected: ${ancestryLower}`);
                betaColumn = `beta.${ancestryLower}`;
                pColumn = `pval.${ancestryLower}`;
                comparison_on_off = false;

                // Update first slider’s label
                d3.select('#pvalue-label-1')
                .text(`Select p-value threshold for ${ancestryLower}`);

                if (data) {

                    ancestryLower = this.value.toLowerCase(); // Update ancestryLower when the selection changes
                    console.log(`Ancestry selected: ${ancestryLower}`);
                    betaColumn = `beta.${ancestryLower}`;
                    pColumn = `pval.${ancestryLower}`;

                    // Call the async function and use the data when it's ready
                    if (data) {
                        // Filter the phe_id column to only include the leftPheno
                        const leftPhenoData = data.filter(d => d.phe_id === leftPheno);

                        // If the beta column contains only NaN values, alert the user
                        
                        const network = initializeNetwork(data, betaColumn, pColumn);
                        const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData);

                        renderNetwork(network.nodes, filteredEdges, graphData, network.width, network.height, leftPheno, rightPheno, network.nodeMap, comparison_on_off);
                    }
                }
            }


            if (checked.length === 2) {
                // Turn on comparison mode
                comparison_on_off = true;

                // Enable the second slider
                d3.select('#pvalue-slider2').property('disabled', false);
                d3.select('#pvalue-input2').property('disabled', false);
                d3.select('#pvalue-threshold2').style('color', 'white');
                d3.select('#pvalue-slider2').style('opacity', 1);
                d3.select('#pvalue-input2').style('opacity', 1);

                // Assign ancestry variables
                anc1 = checked[0].value.toLowerCase();
                anc2 = checked[1].value.toLowerCase();

                // Update both labels
                d3.select('#pvalue-label-1')
                .text(`Select p-value threshold for ${anc1}`);
                d3.select('#pvalue-label-2')
                .text(`Select p-value threshold for ${anc2}`);

                betaColumn = `beta.${anc1}`;
                pColumn = `pval.${anc1}`;

                betaColumn2 = `beta.${anc2}`;
                pColumn2 = `pval.${anc2}`;

                // Optionally store in global scope if needed:
                // window.anc1 = anc1;
                // window.anc2 = anc2;
                window.comparison_on_off = comparison_on_off;

                // Refresh network
                if (!graphData) {
                    console.warn("Data is not loaded yet.");
                    return;
                }

                const network = initializeNetwork(graphData, betaColumn, pColumn, betaColumn2, pColumn2, comparison_on_off);
                const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData, pThreshold2, comparison_on_off);
                // const categories = filteredEdges.map(l => l.target.category);
                // const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(network.nodes, filteredEdges, graphData, network.width, network.height, leftPheno,rightPheno, network.nodeMap, comparison_on_off);

                if (activeNode) {
                    highlightNode(activeNode, filteredEdges, comparison_on_off);
                }
            }
        });

            // Initialize the network with the default ancestry
            const network = initializeNetwork(data, betaColumn, pColumn);
            const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData);
            // const categories = filteredEdges.map(l => l.target.category);
            // const filteredNodes = updateNodes(categories, network.nodes);
            renderNetwork(network.nodes, network.links, network.data, network.width, network.height, leftPheno,rightPheno, network.nodeMap);
        }
        
});

function updateEdges(pThreshold, betaThreshold, betaSign, links, data, pThreshold2 = null, comparison_on_off = false) {
    let filteredEdges;
    if (comparison_on_off && pThreshold2 !== null) {
        // If comparison is on, filter edges based on both pvalue and pvalue2
        filteredEdges = links.filter(l => l.pvalue < pThreshold && l.pvalue2 < pThreshold2);
        }
    else {
        // Filter edges based on the pvalue attribute
        filteredEdges = links.filter(l => l.pvalue < pThreshold);
        }
    // Filter edges based on the beta attribute
    const filteredEdgesBeta = filteredEdges.filter(l => l.beta > betaThreshold);
    // Filter edges based on the direction attribute
    let filteredEdgesDirection;
    if (betaSign === 0) {
        filteredEdgesDirection = filteredEdgesBeta;
    }
    else {
        filteredEdgesDirection = filteredEdgesBeta.filter(l => l.direction === betaSign);
    }
    // return the filtered edges
    return filteredEdgesDirection;
    }

function initializeNetwork(data, betaColumn, pColumn, betaColumn2=null, pColumn2=null, comparison_on_off=false) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2;
    console.log('data:', data);
    const nodeMap = new Map();
    data.forEach(d => {
        if (!nodeMap.has(d.rsid)) nodeMap.set(d.rsid, { id: d.rsid, color: d.rsid_hex });
        if (!nodeMap.has(d.phe_id)) nodeMap.set(d.phe_id, { id: d.phe_id, color: d.phe_hex });
    });
    console.log('Number of nodes:', nodeMap.size);

    let links = data
    .map(d => {
        const betaValue = parseFloat(d[betaColumn]);
        if (isNaN(betaValue)) return null; // Exclude links with NaN beta

        return {
            source: nodeMap.get(d.rsid),
            target: nodeMap.get(d.phe_id),
            beta: Math.abs(betaValue),
            direction: Math.sign(betaValue) || 0,
            pvalue: parseFloat(d[pColumn]) || 1
        };
    })
    .filter(link => link !== null); // Remove null entries
    console.log('Number of links:', links.length);

    // If comparison is enabled, prepare and merge with the second set of links
    if (comparison_on_off) {
        // Create the second set of links
        const links2 = data.map(d => ({
            source: nodeMap.get(d.rsid),
            target: nodeMap.get(d.phe_id),
            beta: isNaN(parseFloat(d[betaColumn2])) ? NaN : Math.abs(parseFloat(d[betaColumn2])),
            direction: Math.sign(parseFloat(d[betaColumn2])) || 0,
            pvalue: parseFloat(d[pColumn2]) || 1
        }));

        // Create a set of valid keys from links2 for fast intersection
        const link2KeySet = new Set(links2.map(link => `${link.source.id}|${link.target.id}`));

        // Create a map from keys to link2 objects for enrichment
        const link2Map = new Map();
        links2.forEach(link => {
            const key = `${link.source.id}|${link.target.id}`;
            link2Map.set(key, link);
        });

        // Filter and enrich links from links1 that exist in links2
        links = links.filter(link => {
            const key = `${link.source.id}|${link.target.id}`;
            return link2KeySet.has(key);
        });

        links.forEach(link => {
            const key = `${link.source.id}|${link.target.id}`;
            const match = link2Map.get(key);
            if (match) {
                // take the max of the two betas
                link.beta = Math.max(link.beta, match.beta); // Use max beta
                link.pvalue2 = match.pvalue; // Optional: store pvalue from second set
                link.direction = link.direction * match.direction; // Multiply directions
            }
        });
    }

    // Identify nodes that only have NaN beta edges 
    // NOTE these next two blocks should be redundant but I'm not messing with them for now
    const nodeEdgeMap = new Map();
    links.forEach(link => {
        if (!nodeEdgeMap.has(link.source.id)) nodeEdgeMap.set(link.source.id, []);
        if (!nodeEdgeMap.has(link.target.id)) nodeEdgeMap.set(link.target.id, []);
        nodeEdgeMap.get(link.source.id).push(link.beta);
        nodeEdgeMap.get(link.target.id).push(link.beta);
    });

    const validNodes = new Set();
    nodeEdgeMap.forEach((betas, nodeId) => {
        if (betas.some(beta => !isNaN(beta))) {
            validNodes.add(nodeId);
        }
    });

    // make a phenodes constant that is the nodes that have an id that does not start with rs
    const PheNodes = Array.from(nodeMap.values()).filter(node => !node.id.startsWith('rs'));

    // Filter nodes and links to remove those only connected by NaN beta edges
    let nodes = Array.from(nodeMap.values()).filter(node => validNodes.has(node.id));
    links = links.filter(link => validNodes.has(link.source.id) && validNodes.has(link.target.id));

    // check rsid nodes to make sure they have non-NaN edges to both left and right phenotypes
    const rsidNodes = nodes.filter(n => n.id.startsWith('rs'));
    const rsidNodeMap = new Map();
    rsidNodes.forEach(n => rsidNodeMap.set(n.id, { left: false, right: false }));
    console.log("number of nodes:", nodes);
    console.log("number of links:", links);
    // Identify RSID nodes that connect to at least two distinct phenotype nodes
    rsidNodes.forEach(rsNode => {
        const connectedPhenotypes = new Set();

        links.forEach(link => {
            if (link.source.id === rsNode.id && !link.target.id.startsWith('rs')) {
                connectedPhenotypes.add(link.target.id);
            }
            if (link.target.id === rsNode.id && !link.source.id.startsWith('rs')) {
                connectedPhenotypes.add(link.source.id);
            }
        });

        if (connectedPhenotypes.size >= 2) {
            rsidNodeMap.set(rsNode.id, true);
        }
    });

    // Extract valid RSID nodes
    const validRSIDNodes = rsidNodes.filter(n => rsidNodeMap.get(n.id));
    
    const validRSIDNodeIds = new Set(validRSIDNodes.map(n => n.id));
    // filter the nodes to include nodes that are in validRSIDNodeIds or DO NOT start with rs
    nodes = nodes.filter(n => validRSIDNodeIds.has(n.id) || !n.id.startsWith('rs'));
    links = links.filter(l => validRSIDNodeIds.has(l.source.id) || validRSIDNodeIds.has(l.target.id));

    return {
        nodes,
        links,
        data,
        width,
        height,
        nodeMap
    };
}



function renderNetwork(nodes, links, data, width, height, leftPheno, rightPheno, nodeMap, comparison_on_off = false) {
    // Clear existing network before rendering new one
    d3.select('svg').selectAll('*').remove();

    // Arrange RSID nodes in line down the middle of the screen
    let rsidNodes = nodes.filter(n => n.id.startsWith('rs'));
    
    // sort rsidNodes by chromosome
    // remove any nodes have less than 2 links
    rsidNodes = rsidNodes.filter(n => {
        const numLinks = links.filter(l => l.source.id === n.id || l.target.id === n.id).length;
        return numLinks >= 2;
    });
    // remove links that are not in rsidNodes
    links = links.filter(l => rsidNodes.some(n => n.id === l.source.id || n.id === l.target.id));

    // filter nodes to only include those that are in rsidNodes or nodes that do not start with rs
    nodes = nodes.filter(n => rsidNodes.some(r => r.id === n.id) || !n.id.startsWith('rs'));

    rsidNodes.forEach((node, i) => {
        // add a label
        node.label = node.id;
        // add an attribute called chromosome that comes from the chrom column in the data
        const chromValue = data.find(d => d.rsid === node.id)?.chrom;
        node.category = chromValue ? parseFloat(chromValue) : null;
        });
    rsidNodes.sort((a, b) => a.category - b.category);
        const middle_x = width / 2;
        rsidNodes.forEach((node, i) => {
            node.x = middle_x;
            node.y = (i + 1) * height / (rsidNodes.length + 1);
    });
    
    // Arrange phenotype nodes 
    const middle_y = height / 2;
    const left_x = width / 5;
    const right_x = width * 4 / 5;

    // make a variable called leftNode that is the node with the id leftPheno
    const leftNode = nodes.find(n => n.id === leftPheno);
    const rightNode = nodes.find(n => n.id === rightPheno);

    if (leftNode[0]?.x) {
        // if they do, do nothing
        
    }
    else {
        // set the x and y attributes of the leftNode
        leftNode.x = left_x;
        leftNode.y = middle_y;
        rightNode.x = right_x;
        rightNode.y = middle_y;

        // assign colors and categories to the nodes
        leftNode.color = leftNode.id === leftPheno ? nodeMap.get(leftPheno).color : leftNode.color || 'gray';
        rightNode.color = rightNode.id === rightPheno ? nodeMap.get(rightPheno).color : rightNode.color || 'gray';
        leftNode.label = data.find(d => d.phe_id === leftPheno).phe_label;
        rightNode.label = data.find(d => d.phe_id === rightPheno).phe_label;
        leftNode.category = data.find(d => d.phe_id === leftPheno).phe_cat;
        rightNode.category = data.find(d => d.phe_id === rightPheno).phe_cat;
    }

    // Create SVG and set dynamic size
    const svg = d3.select('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background-color', '#252529');

    // make a const called maxBeta that is the maximum beta value in the links array
    const maxBeta = d3.max(links, d => Math.abs(d.beta));
    const scalingFactor = 10 / maxBeta;

    // Draw edges with color and thickness based on beta, with default opacity 0
    let pos_color = '#16faef';
    let neg_color = '#fc0339';
    if (comparison_on_off) {
        pos_color = '#32CD32';
        neg_color = '#CC5500';
    } else {
        pos_color = '#16faef';
        neg_color = '#fc0339';
    }

    // Draw edges with color and thickness based on beta, with default opacity 0
    svg.selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
        .attr('stroke-width', d => Math.abs(d.beta) * scalingFactor)
        .attr('stroke', d => (d.direction >= 0 ? pos_color : neg_color))
        .attr('opacity', 1);


    // Draw nodes with appropriate size and color
    svg.selectAll('circle')
        .data(nodes)
        .enter()
        .append('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        // set the radius to be 3 if the id starts with rs, and 10 otherwise
        .attr('r', d => d.id.startsWith('rs') ? 10 : 10)
        .attr('fill', d => d.color || 'gray')
        // on double click open dendrogram.html in a new tab with the double clicked node as the center node, using the current pvalue and ancestry
        .on('dblclick', (event, d) => {
            // if the node is not an rsid, open the dendrogram
            if (!d.id.startsWith('rs')) {
            window.open(`page2.html?centerPheno=${d.id}&pvalue=${pThreshold}&ancestry=${ancestryLower}`, '_blank');
            }
        });


    // Add labels to nodes with two lines of text
    svg.selectAll('text')
        .data(nodes)
        .enter()
        .append('text')
        .attr('x', d => d.x)
        .attr('y', d => d.y + (d.id.startsWith('rs') ? -10 : 15))
        .attr('text-anchor', 'middle')
        .attr('font-size', 20)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
        .text(d => d.label ? `${d.label}\n(${d.category})` : d.id);

    // Define font size for measurement consistency
    const fontSize = 20;

    // Add labels with background rectangles
    const labels = svg.selectAll('.label-group')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'label-group')
        .attr('opacity', 0)  // Initially hidden
        .style('pointer-events', 'none'); // Ensures labels don’t block interactions

    // Add text elements
    labels.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', fontSize)
        .text(d => d.label ? `${d.label}\n(${d.category})` : d.id)
        .each(function (d) {
            const bbox = this.getBBox(); // Get text size
            d.textWidth = bbox.width;
            d.textHeight = bbox.height;
        })
        .attr('x', d => d.x)
        .attr('y', d => d.y + 4); // Adjust for centering

    // Add background rectangles
    labels.insert('rect', 'text')
        .attr('x', d => d.x - d.textWidth / 2 - 4) // Center and add padding
        .attr('y', d => d.y - d.textHeight / 2 - 2)
        .attr('width', d => d.textWidth + 8)
        .attr('height', d => d.textHeight + 4)
        .attr('fill', 'white')
        .attr('opacity', 0.8)
        .attr('rx', 5).attr('ry', 5); // Rounded corners

    // Modify hover interactions to include label groups
    svg.selectAll('circle')
        .on('mouseover', (event, d) => {
            d3.selectAll('.label-group')
                .filter(nd => nd.id === d.id)
                .transition().duration(300)
                .attr('opacity', 1);
        })
        .on('mouseout', (event, d) => {
            d3.selectAll('.label-group')
                .filter(nd => nd.id === d.id)
                .transition().duration(300)
                .attr('opacity', 0);
        });

} 

