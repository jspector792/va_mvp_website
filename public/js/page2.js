// Global variables to store center phenotype and links
let centerPheno = null;
let links = [];
let pThreshold = 1;
let betaThreshold = 0;
let betaSign = 0;
let nodes = [];
let activeNode = null;
let graphData = null;
let ancestryToggle = null;
let ancestryLower = null; // Declare ancestryLower as a global variable, and use let instead of const
let comparison_on_off = false; // Declare comparison_on_off as a global variable
let anc1 = null; // Declare anc1 as a global variable
let anc2 = null; // Declare anc2 as a global variable
let betaColumn2 = null; // Declare betaColumn2 as a global variable
let pColumn2 = null; // Declare pColumn2 as a global variable
let pThreshold2 = 1; // Declare pThreshold2 as a global variable, default to 1

// Function to parse query parameters
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        ancestry: params.get('ancestry'),
        // pvalue will be given in scientific notation, and we should pull the exponent. So if it is 1e-10, we should get -10
        pvalue: parseFloat(params.get('pvalue')).toExponential().split('e')[1],
        // pvalue: params.get('pvalue'),
        centerPheno: params.get('centerPheno')
    };
}

const params = getQueryParams();
centerPheno = params.centerPheno;

ancestryLower = params.ancestry.toLowerCase(); // Initialize ancestryLower from the query parameter
let betaColumn = `beta.${ancestryLower}`;
let pColumn = `pval.${ancestryLower}`;
pThreshold = parseFloat(params.pvalue);

async function loadData() {
    // Check if the centerPheno requires loading two chunks
    const splitPhenotypes = ['181', '167', '170', '175'];
    let data = [];
    if (splitPhenotypes.includes(centerPheno)) {
        const file1 = `/data/node_files/${centerPheno}_1.csv`;
        const file2 = `/data/node_files/${centerPheno}_2.csv`;
        try {
            const [data1, data2] = await Promise.all([d3.csv(file1), d3.csv(file2)]);
            data = data1.concat(data2);
        } catch (error) {
            console.error(`Error loading split files for ${centerPheno}:`, error);
            return null;
        }
    } else {
        const fileName = `/data/node_files/${centerPheno}.csv`;
        try {
            data = await d3.csv(fileName);
        } catch (error) {
            console.error(`Error loading file ${fileName}:`, error);
            return null;
        }
    }
    console.log('Number of rows:', data.length);
    return data;
    
}

// Call the async function and use the data when it's ready
loadData().then((data) => {
    if (data) {
        graphData = data;
        const base_ancestries = ['amr', 'eas', 'afr', 'eur','meta'];
        for (let ancestry of base_ancestries) {
            const betaColumn = `beta.${ancestry}`;
            const pColumn = `pval.${ancestry}`;
            // Filter the phe_id column to only include the centerPheno
            const centerPhenoData = data.filter(d => d.phe_id === centerPheno);

            // If the beta column contains only NaN values, remove the ancestry from the base_ancestries list
            if (centerPhenoData.every(d => isNaN(parseFloat(d[betaColumn])))) {
                base_ancestries.splice(base_ancestries.indexOf(ancestry), 1);
            }
        }

        
        // Define the log scale range
        const minLogP = -12; // Corresponding to 10^-10
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
                <div style="margin-top: 5px;">
                    <input type="range" id="pvalue-slider" name="pvalue-slider" min="${minLogP}" max="${maxLogP}" step="0.1" value="${maxLogP}">
                    <input type="number" id="pvalue-input" step="0.1" min="${minLogP}" max="${maxLogP}" value="${maxLogP}">
                    <span id="pvalue-threshold">1e${maxLogP}</span>
                </div>
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
                const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(filteredNodes, filteredLinks, graphData, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);

                if (activeNode) {
                    console.log('Re-highlighting active node:', activeNode);
                    highlightNode(activeNode, filteredEdges, comparison_on_off);
                }
            }, 200); // 200ms debounce delay
        };

        // Initialize the slider and input with the value from the query parameter
        const initialPValue = params.pvalue || maxLogP;
        d3.select('#pvalue-slider').property('value', initialPValue);
        d3.select('#pvalue-input').property('value', initialPValue);
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
                const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(filteredNodes, filteredLinks, graphData, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);

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
            .style('top', '130px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label for="beta-threshold-slider">Select beta threshold:</label>
                </div>
                <div style="margin-top: 5px;">
                    <input type="range" id="beta-threshold-slider" name="beta-threshold-slider" min="0" max="1" step="0.01" value="0">
                    <input type="number" id="beta-input" step="0.01" min="0" max="1" value="0">
                    <span id="beta-threshold">0</span>
                </div>
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
            const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

            renderNetwork(filteredNodes, filteredLinks, graphData, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);

            if (activeNode) {
                highlightNode(activeNode, filteredEdges, comparison_on_off);
            }
        }, 200); // 200ms debounce delay
        };

        // Initialize the slider and input with the value from the query parameter
        const initialBeta = 0;
        d3.select('#beta-threshold-slider').property('value', initialBeta);
        d3.select('#beta-input').property('value', initialBeta);
        updateBetaThreshold(initialBeta);

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
        .text('About Phenotype View')
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
            <h2>Phenotype View</h2>
            <p>
                The center node is the phenotype that was selected from the overall graph.<br><br>
                The inner ring of nodes are its top 100 associated SNPs, ranked by p value.<br><br>
                These nodes are arranged and colored by chromosome. The chromosome number is also 
                listed in the label, which can be seen by hovering over a node.<br><br>
                The outer ring of nodes are the other phenotypes associated with the same SNPs.<br><br>
                These nodes are arranged and colored by category, and are the center node's 
                nearest neighbors in the larger graph.<br><br>
                Click on a node to highlight its connections. Clicking on the center 
                phenotype will reveal the full network.<br><br>
                Links are colored based on the direction of their association with the 
                phenotype (blue for positive, red for negative). The thickness corresponds to the effect size.<br><br>
                Selecting a second ancestry re-colors the links so that they are green if the association is the same
                direction in both ancestries, and orange if they are different directions. The p-values can be toggled independently for 
                the two ancestries<br><br>
                Double-click on a phenotype node to open a new dendrogram.<br><br>
                Right click on an outer node to open an edge view between it and the center node.<br><br>
                Press the 'Escape' key to reset the network view.
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
            const csvString = d3.csvFormat(data);
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
                    // Filter the phe_id column to only include the centerPheno
                    const centerPhenoData = data.filter(d => d.phe_id === centerPheno);

                    // If the beta column contains only NaN values, alert the user
                    if (centerPhenoData.every(d => isNaN(parseFloat(d[betaColumn])))) {
                        alert(`The selected ancestry (${ancestryLower}) does not contain any data for the center phenotype (${centerPhenoData[0].phe_label}).`);
                    } else {
                        const network = initializeNetwork(data, betaColumn, pColumn);
                        const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData);
                        // const categories = filteredEdges.map(l => l.target.category);
                        const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);
                        renderNetwork(filteredNodes, filteredLinks, graphData, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);
                        if (activeNode) {
                            console.log('Re-highlighting active node:', activeNode);
                            highlightNode(activeNode, filteredEdges, comparison_on_off);
                        }
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
                const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);

                renderNetwork(filteredNodes, filteredLinks, graphData, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);

                if (activeNode) {
                    highlightNode(activeNode, filteredEdges, comparison_on_off);
                }
            }
        });


        // Initialize the network with the default ancestry
        const network = initializeNetwork(data, betaColumn, pColumn);
        const filteredEdges = updateEdges(pThreshold, betaThreshold, betaSign, network.links, graphData);
        // const categories = filteredEdges.map(l => l.target.category);
        const { nodes: filteredNodes, edges: filteredLinks } = updateNodes(filteredEdges, network.nodes);
        renderNetwork(filteredNodes, filteredLinks, network.data, network.width, network.height, centerPheno, network.centerX, network.centerY, network.nodeMap, comparison_on_off);
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

function updateNodes(edges, nodes) {
    // find all the nodes that have ids starting with rs
    const rsidNodes = nodes.filter(node => node.id.startsWith('rs'));
    // eliminate any rsid nodes that have less than 2 edges
    const rsidNodesFiltered = rsidNodes.filter(node => {
        const degree = edges.reduce((count, edge) => {
            return count + ((edge.source.id === node.id || edge.target.id === node.id) ? 1 : 0);
        }, 0);
        return degree >= 2;
    });

    // find all the nodes that have ids not starting with rs
    const pheNodes = nodes.filter(node => !node.id.startsWith('rs'));
    // filter phenodes to include only those with at least one edge to a node in rsidNodesFiltered
    const pheNodesFiltered = pheNodes.filter(node => {
        return edges.some(edge => {
            if (edge.source.id === node.id) {
                return rsidNodesFiltered.some(rsNode => rsNode.id === edge.target.id);
            } else if (edge.target.id === node.id) {
                return rsidNodesFiltered.some(rsNode => rsNode.id === edge.source.id);
            }
            return false;
        });
    }
    );
    // combine the filtered rsidNodes and pheNodes
    const filteredNodes = rsidNodesFiltered.concat(pheNodesFiltered);

    const nodeIdSet = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = edges.filter(edge =>
        nodeIdSet.has(edge.source.id) && nodeIdSet.has(edge.target.id)
    );


    // return filtered nodes and edges
    return {
        nodes: filteredNodes,
        edges: filteredEdges
    }

}   

// Function to highlight a selected node and its relevant edges
function highlightNode(activeNode, links, comparison_on_off = false) {

    console.log('comparison_on_off:', comparison_on_off);
    if (!centerPheno || !links.length) {
        console.warn('highlightNode called before network was initialized.');
        return;
    }

    // make a list of the nodes that are connected to the active node
    const connected_edges = links.filter(l => l.source.id === activeNode.id || l.target.id === activeNode.id);
    // take whichever end of the link is the active node and make a list of the other end
    const connectedNodes = connected_edges.map(l => l.source.id === activeNode.id ? l.target.id : l.source.id);
    
    const isPhenotype = !activeNode.id.startsWith('rs');
    // const isRSID = activeNode.id.startsWith('rs');

    // Reduce opacity of all nodes except activeNode, its neighbors, and center phenotype
    d3.selectAll('circle')
        .transition().duration(300)
        .style('opacity', d => {
            if (activeNode.id === centerPheno) {
                // do nothing
                console.log(activeNode.id === centerPheno);
                return 1;
            } else {
                return d.id === activeNode.id || d.id === centerPheno || links.some(l =>
                    (l.source.id === activeNode.id && l.target.id === d.id) ||
                    (l.target.id === activeNode.id && l.source.id === d.id))
                    ? 1
                    : 0.3;
            }
        });
        


    // Highlight edges
    d3.selectAll('line')
        .transition().duration(300)
        .style('opacity', d => {
            if (activeNode.id === centerPheno) {
                // make all edges visible
                return 0.5;
            }
            else {
                let visible_opacity;
                if (comparison_on_off) {
                    visible_opacity = 1; //placeholder in case we want to change this but they should be the same for now
                } else {
                    visible_opacity = 1;
                }
                if (d.source.id === activeNode.id || d.target.id === activeNode.id) {
                    return visible_opacity;
                }
                if (isPhenotype) {
                    if (d.source.id === activeNode.id || d.target.id === activeNode.id) {
                        return visible_opacity;
                    }

                if (connectedNodes.includes(d.source.id) && d.target.id === centerPheno) {
                    return visible_opacity;
                }
                if (connectedNodes.includes(d.target.id) && d.source.id === centerPheno) {
                    return visible_opacity;
                }
                }
                return 0;
            }

        });
    // on escape key set the active node to null and reset the styles to the defaults
    d3.select('body').on('keydown', (event) => {
        if (event.key === 'Escape') {
            activeNode = null;
            d3.selectAll('circle')
                .transition().duration(300)
                .style('opacity', 1);
            d3.selectAll('line')
                .transition().duration(300)
                .style('opacity', 0);
        }
    });

}



function initializeNetwork(data, betaColumn, pColumn, betaColumn2 = null, pColumn2 = null, comparison_on_off = false) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2;

    const nodeMap = new Map();
    data.forEach(d => {
        if (!nodeMap.has(d.rsid)) nodeMap.set(d.rsid, { id: d.rsid, color: d.rsid_hex });
        if (!nodeMap.has(d.phe_id)) nodeMap.set(d.phe_id, { id: d.phe_id, color: d.phe_hex });
    });

    let links = data.map(d => ({
        source: nodeMap.get(d.rsid),
        target: nodeMap.get(d.phe_id),
        beta: isNaN(parseFloat(d[betaColumn])) ? NaN : Math.abs(parseFloat(d[betaColumn])),
        direction: Math.sign(parseFloat(d[betaColumn])) || 0,
        pvalue: parseFloat(d[pColumn]) || 1
    }));

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

    // console log betaColumn, and the first 10 values
    console.log('betaColumn:', betaColumn);
    console.log('First 10 beta values:', links.slice(0, 10).map(l => l.beta));

    // filter out edges that have a nan beta value
    links = links.filter(l => !isNaN(l.beta));
    
    // Identify nodes that only have NaN beta edges
    const nodeEdgeMap = new Map();
    links.forEach(link => {
        if (!nodeEdgeMap.has(link.source.id)) nodeEdgeMap.set(link.source.id, []);
        if (!nodeEdgeMap.has(link.target.id)) nodeEdgeMap.set(link.target.id, []);
        nodeEdgeMap.get(link.source.id).push(link.beta);
        nodeEdgeMap.get(link.target.id).push(link.beta);
    });
    // console log the links connected to the centerPheno
    const centerNode = nodeMap.get(centerPheno);

    const validNodes = new Set();
    nodeEdgeMap.forEach((betas, nodeId) => {
        if (betas.some(beta => !isNaN(beta))) {
            validNodes.add(nodeId);
        }
    });

    // Filter nodes and links to remove those only connected by NaN beta edges
    let nodes = Array.from(nodeMap.values()).filter(node => validNodes.has(node.id));
    links = links.filter(link => validNodes.has(link.source.id) && validNodes.has(link.target.id));
    
    // make a set of links that are connected to the centerPheno
    const centerLinks = links.filter(link => link.source.id === centerPheno || link.target.id === centerPheno);
    // sort the links by pvalue and take the top 100
    centerLinks.sort((a, b) => a.pvalue - b.pvalue);
    const topLinks = centerLinks.slice(0, 100);
    // fitler the rsid nodes to include only the topLinks
    const topRsidNodes = new Set();
    topLinks.forEach(link => {
        if (link.source.id === centerPheno) {
            topRsidNodes.add(link.target.id);
        } else {
            topRsidNodes.add(link.source.id);
        }
    }
    );
    // filter the nodes to include only the topRsidNode AND any non rsid nodes
    nodes = nodes.filter(node => topRsidNodes.has(node.id) || !node.id.startsWith('rs'))
    // filter the links to include only nodes that are still in nodes
    links = links.filter(link => topRsidNodes.has(link.source.id) || topRsidNodes.has(link.target.id));
    // calculate the degree of all the non rsid and non centerPheno nodes
    const nodeDegrees = new Map();
    nodes.forEach(node => {
        if (!node.id.startsWith('rs') && node.id !== centerPheno) {
            nodeDegrees.set(node.id, 0);
        }
    }
    );
    // calculate the degree of each node
    links.forEach(link => {
        if (nodeDegrees.has(link.source.id)) {
            nodeDegrees.set(link.source.id, nodeDegrees.get(link.source.id) + 1);
        }
        if (nodeDegrees.has(link.target.id)) {
            nodeDegrees.set(link.target.id, nodeDegrees.get(link.target.id) + 1);
        }
    });
    // remove any nodes that have a degree of 0
    nodeDegrees.forEach((degree, nodeId) => {
        if (degree <= 1) {
            nodeDegrees.delete(nodeId);
        }
    });
    console.log('nodeDegrees:', nodeDegrees);
    // sort the nodeDegrees by value and take the top 100
    const topNodesByDegree = Array.from(nodeDegrees.entries()).sort((a, b) => b[1] - a[1]).slice(0, 100);
    // make a set of the top nodes
    const topNodesSet = new Set(topNodesByDegree.map(d => d[0]));
    // filter the nodes to include only the top nodes
    nodes = nodes.filter(node => topNodesSet.has(node.id) || node.id.startsWith('rs') || node.id === centerPheno);
    // filter the links to include only the top nodes
    links = links.filter(link => topNodesSet.has(link.source.id) || topNodesSet.has(link.target.id) || link.source.id === centerPheno || link.target.id === centerPheno);


    if (nodeMap.has(centerPheno) && validNodes.has(centerPheno)) {
        const centerNode = nodeMap.get(centerPheno);
        centerNode.x = centerX;
        centerNode.y = centerY;
        centerNode.color = centerNode.color || 'gray';
        centerNode.label = data.find(d => d.phe_id === centerPheno).phe_label;
        centerNode.category = data.find(d => d.phe_id === centerPheno).phe_cat;
    }

    return {
        nodes,
        links,
        data,
        width,
        height,
        centerX,
        centerY,
        nodeMap
    };
}


function renderNetwork(nodes, links, data, width, height, centerPheno, centerX, centerY, nodeMap, comparison_on_off = false) {
    // Clear existing network before rendering new one
    d3.select('svg').selectAll('*').remove();

    // Arrange RSID nodes in a circular layout
    const rsidNodes = nodes.filter(n => n.id.startsWith('rs'));
    console.log('nodes:', nodes);
    const radius = Math.min(width, height) * 0.35;

    // Sort rsidNodes by chromosome
    if (!rsidNodes[0]?.x) {
        rsidNodes.forEach((node, i) => {
            node.label = node.id;
            const chromValue = data.find(d => d.rsid === node.id)?.chrom;
            node.category = chromValue ? parseFloat(chromValue) : null;
        });
        rsidNodes.sort((a, b) => a.category - b.category);
        rsidNodes.forEach((node, i) => {
            const angle = (i * 2 * Math.PI) / rsidNodes.length;
            node.x = centerX + radius * Math.cos(angle);
            node.y = centerY + radius * Math.sin(angle);
        });
    }

    // Arrange phenotype nodes in a circular layout
    const pheNodes = nodes.filter(n => !n.id.startsWith('rs') && n.id !== centerPheno);

    if (!pheNodes[0]?.x) {
        const radiusPhe = Math.min(width, height) * 0.45;
        pheNodes.forEach((node, i) => {
            node.label = data.find(d => d.phe_id === node.id)?.phe_label || node.id;
            node.category = data.find(d => d.phe_id === node.id)?.phe_cat || 'Unknown';
        });
        pheNodes.sort((a, b) => a.category.localeCompare(b.category));
        pheNodes.forEach((node, i) => {
            const angle = (i * 2 * Math.PI) / pheNodes.length;
            node.x = centerX + radiusPhe * Math.cos(angle);
            node.y = centerY + radiusPhe * Math.sin(angle);
        });
    }

    // Create SVG and set dynamic size
    const svg = d3.select('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background-color', '#252529');

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

    // define a scaling factor that is the maximum beta divided by the diameter of the circles (which is 10)
    const maxBeta = d3.max(links, d => Math.abs(d.beta));
    const scalingFactor = 10 / maxBeta;
    
    svg.selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('x1', d => d.source?.x || 0) // Check for undefined source
        .attr('y1', d => d.source?.y || 0) // Check for undefined source
        .attr('x2', d => d.target?.x || 0) // Check for undefined target
        .attr('y2', d => d.target?.y || 0) // Check for undefined target
        .attr('stroke-width', d => Math.abs(d.beta) * scalingFactor + 0.5) // Scaling factor
        .attr('stroke', d => (d.direction >= 0 ? pos_color : neg_color))
        .attr('opacity', 0);

    // Draw nodes with appropriate size and color
    svg.selectAll('circle')
        .data(nodes)
        .enter()
        .append('circle')
        .attr('cx', d => d?.x || 0) // Check for undefined x
        .attr('cy', d => d?.y || 0) // Check for undefined y
        .attr('r', d => d.id === centerPheno ? 15 : (d.id.startsWith('rs') ? 10 : 10))
        .attr('fill', d => d.id === centerPheno ? nodeMap.get(centerPheno)?.color : d?.color || 'gray')
        .on('dblclick', (event, d) => {
            // if the node is not an rsid node:
            if (!d.id.startsWith('rs')) {
                // count the number of neighbors NEEDS TO BE UPDATED, technically it has to be connected to the center pheno, not just snps
                let nns = 0;
                links.forEach(l => {
                    if (l.source?.id === d.id || l.target?.id === d.id) {
                        nns++;
                    }
                });
                if (nns === 0) {
                    alert('This node is not connected to the current center phenotype under these conditions. Filters will be reset to open a new dendrogram.');
                    window.open(`page2.html?ancestry=${params.ancestry}&pvalue=${params.pvalue}&centerPheno=${d.id}`, '_blank');
                } else {
                    window.open(`page2.html?ancestry=${ancestryLower}&pvalue=${pThreshold}&centerPheno=${d.id}`, '_blank');
                }
            }
        })
        .on('click', (event, d) => {
            activeNode = d;
            highlightNode(d, links, comparison_on_off);
        })
        .on('contextmenu', function (event, d) {
            //clear any existing context menus
            d3.selectAll('.context-menu').remove();
            // if the node is an rsid node:
            if (!d.id.startsWith('rs')) {
                event.preventDefault(); // Prevent the default context menu from appearing
        
                // Create a custom context menu
                const contextMenu = d3.select('body')
                    .append('div')
                    .attr('class', 'context-menu')
                    .style('position', 'absolute')
                    .style('left', `${event.pageX}px`)
                    .style('top', `${event.pageY}px`)
                    .style('background', 'white')
                    .style('border', '1px solid #ccc')
                    .style('padding', '5px')
                    .style('z-index', 1000);
        
                // Add "Open SNP View" option to the context menu
                contextMenu.append('div')
                    .text('Open Edge View')
                    .style('cursor', 'pointer')
                    .style('padding', '5px')
                    .on('click', function () {
                        // Open sankey.html with selectedNode as leftPheno and the right-clicked node as rightPheno
                        window.open(`page3.html?ancestry=${ancestryLower}&pvalue=${pThreshold}&leftPheno=${centerPheno}&rightPheno=${d.id}`);
                        contextMenu.remove(); // Remove the context menu after selection
                    });
        
                // Close the context menu when clicking outside of it
                d3.select('body').on('click.context-menu', function () {
                    contextMenu.remove();
                    d3.select('body').on('click.context-menu', null); // Remove the event listener
                });
            }
        });

    // Add labels to nodes with two lines of text
    svg.selectAll('text')
        .data(nodes)
        .enter()
        .append('text')
        .attr('x', d => d?.x || 0) // Check for undefined x
        .attr('y', d => d?.y + (d.id === centerPheno ? 20 : (d.id.startsWith('rs') ? -10 : 15)) || 0) // Check for undefined y
        .attr('text-anchor', 'middle')
        .attr('font-size', 20)
        .attr('opacity', 0)
        .style('pointer-events', 'none')
        .text(d => d.label ? `${d.label} (${d.category})` : d.id);

    // Add labels with background rectangles
    const labels = svg.selectAll('.label-group')
        .data(nodes)
        .enter()
        .append('g')
        .attr('class', 'label-group')
        .attr('opacity', 0)
        .style('pointer-events', 'none');

    labels.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', 20)
        .text(d => d.label ? `${d.label} (${d.category})` : d.id)
        .each(function (d) {
            const bbox = this.getBBox();
            d.textWidth = bbox.width;
            d.textHeight = bbox.height;
        })
        .attr('x', d => d?.x || 0) // Check for undefined x
        .attr('y', d => d?.y + 4 || 0); // Check for undefined y

    labels.insert('rect', 'text')
        .attr('x', d => d?.x - d.textWidth / 2 - 4 || 0) // Check for undefined x
        .attr('y', d => d?.y - d.textHeight / 2 - 2 || 0) // Check for undefined y
        .attr('width', d => d.textWidth + 8)
        .attr('height', d => d.textHeight + 4)
        .attr('fill', 'white')
        .attr('opacity', 0.8)
        .attr('rx', 5).attr('ry', 5);

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



