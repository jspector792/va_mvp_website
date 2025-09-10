let nodes;
let links;
let ancestry = 'meta'; // Default ancestry
let pvalue = '1e-04'; // Default p-value
let edgeType = 'weight'; // Default edge type

document.addEventListener('DOMContentLoaded', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Create an SVG element
    const svg = d3.select('body')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .style('background-color', '#252529');  // Set background color to black

    // Create a group <g> element to contain all nodes and links
    const content = svg.append('g');

    // // Load the CSV files containing the edgelist and node attributes
    Promise.all([
        d3.csv('/data/edgelist_updated_scaled.csv'),
        d3.csv('/data/node_attributes.csv')
    ]).then(([edgelist, nodeAttributes]) => {
        nodes = nodeAttributes.map(d => {
            // Start with hardcoded attributes
            const node = {
                id: d.id,
                x: +d.x,
                y: +d.y,
                size: +d.size,
                label: d.label,
                color: d.hex,
                category: d.phenotype_category,
                degree: +d.degree
            };
        
            // Dynamically add any other attributes present in the node attributes file
            Object.keys(d).forEach(key => {
                if (!node.hasOwnProperty(key)) {
                    node[key] = isNaN(+d[key]) ? d[key] : +d[key]; // Convert numeric values to numbers
                }
            });
        
            return node;
        });

        const nodeMap = new Map(nodes.map(node => [node.id, node]));

        function getNodeById(id) {
            return nodeMap.get(id);
        }
        
        // Add the links, with all attributes from the edgelist
        links = edgelist.map(d => {
            const link = { source: d.source, target: d.target }; // Base structure
            // Dynamically add all other attributes
            for (const [key, value] of Object.entries(d)) {
                if (!['source', 'target'].includes(key)) { // Exclude source and target
                    link[key] = isNaN(+value) ? value : +value; // Convert to number if applicable
                }
            }
            return link;
        });

        // Precompute node neighbors
        const nodeNeighborsMap = new Map();

        nodes.forEach(node => {
            nodeNeighborsMap.set(node.id, []);
        });

        links.forEach(link => {
            nodeNeighborsMap.get(link.source).push(link.target);
            nodeNeighborsMap.get(link.target).push(link.source);
        });

        // Add a container for the search bar
        const searchContainer = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '400px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white');

        searchContainer.html(`
            <div>
            <label for="search-bar">Search Node:</label>
            </div>
            <input id="search-bar" type="text" placeholder="Enter node label">
            <ul id="search-dropdown" style="list-style: none; margin: 0; padding: 0; max-height: 150px; overflow-y: auto; background: #46464d; color: white; display: none;"></ul>
        `);

        // Initialize the slider here
        const degreeFilterContainer = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '10px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label for="degree-slider">Filter by Node Degree:</label>
                </div>
                <input id="degree-slider" type="range" min="0" max="${d3.max(nodes, d => d.degree)}" step="1" value="0">
                <input id="degree-input" type="number" min="0" max="${d3.max(nodes, d => d.degree)}" step="1" value="0" 
                    style="width: 60px; margin-left: 10px;">
                <span id="degree-value">0</span>
            `);

        // Event handler for the slider
        d3.select('#degree-slider').on('input', function () {
            const degreeThreshold = +this.value;

            // Update the input box and degree value display
            d3.select('#degree-input').property('value', degreeThreshold);
            d3.select('#degree-value').text(degreeThreshold);

            // Apply filtering
            updateFilter(degreeThreshold);
        });

        // Event handler for the input box
        d3.select('#degree-input').on('input', function () {
            const degreeThreshold = +this.value;

            // Synchronize slider and degree value display
            d3.select('#degree-slider').property('value', degreeThreshold);
            d3.select('#degree-value').text(degreeThreshold);

            // Apply filtering
            updateFilter(degreeThreshold);
        });

        // Function to apply filtering logic
        function updateFilter(degreeThreshold) {
            // Filter nodes based on degree threshold
            filteredNodes = nodes.filter(n => n.degree >= degreeThreshold);

            // Filter links based on the condition that both source and target meet the degree threshold
            filteredLinks = links.filter(l =>
                filteredNodes.some(n => n.id === l.source) &&  // Source node passes filter
                filteredNodes.some(n => n.id === l.target)    // Target node passes filter
            );

            // Update node opacity to reflect filtering
            node.style('opacity', n => filteredNodes.some(fn => fn.id === n.id) ? 1 : 0.2);

            // Call highlightNode to reapply the node highlighting logic
            if (activeNode) highlightNode(activeNode);
        }


        const searchBar = d3.select('#search-bar');
        const dropdown = d3.select('#search-dropdown');

        // Filter dropdown options as user types
        searchBar.on('input', function () {
            const query = this.value.toLowerCase();

            dropdown.selectAll('li').remove();

            if (query) {
                const matches = nodes.filter(n => n.label.toLowerCase().includes(query));

                if (matches.length > 0) {
                    dropdown.style('display', 'block');
                    dropdown.selectAll('li')
                        .data(matches)
                        .enter()
                        .append('li')
                        .style('padding', '5px')
                        .style('cursor', 'pointer')
                        .on('click', function (event, d) {
                            // set the active node to the selected node
                            activeNode = d;
                            highlightNode(d);
                            searchBar.node().value = d.label;
                            dropdown.style('display', 'none');
                        })
                        .text(d => d.label);
                } else {
                    dropdown.style('display', 'none');
                }
            } else {
                dropdown.style('display', 'none');
            }
        });

        // Handle Enter key to select the first match
        searchBar.on('keydown', function (event) {
            if (event.key === 'Enter') {
                const query = this.value.toLowerCase();
                const match = nodes.find(n => n.label.toLowerCase().includes(query));

                if (match) {
                    activeNode = match;
                    highlightNode(match);
                    dropdown.style('display', 'none');
                }
            }
        });

        // Create the ancestry toggle checkbox menu
        const ancestryToggle = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '230px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label>Select Ancestry:</label>
                </div>
                <div id="ancestry-checkboxes" style="border: 1px solid white; padding: 5px; max-width: 200px;">
                    <div><input type="checkbox" class="ancestry-option" value="meta" id="chk-meta"><label for="chk-meta">ALL</label></div>
                    <div><input type="checkbox" class="ancestry-option" value="amr" id="chk-amr"><label for="chk-amr">AMR</label></div>
                    <div><input type="checkbox" class="ancestry-option" value="eas" id="chk-eas"><label for="chk-eas">EAS</label></div>
                    <div><input type="checkbox" class="ancestry-option" value="afr" id="chk-afr"><label for="chk-afr">AFR</label></div>
                    <div><input type="checkbox" class="ancestry-option" value="eur" id="chk-eur"><label for="chk-eur">EUR</label></div>
                </div>
                <p style="font-size: 12px;">(Select one ancestry)</p>
            `);

        // Enforce radio-button-like behavior with checkboxes
        d3.selectAll('.ancestry-option').on('change', function () {
            // Uncheck all checkboxes
            d3.selectAll('.ancestry-option').property('checked', false);
            // Check only the clicked one
            d3.select(this).property('checked', true);

            // Update ancestry variable
            ancestry = this.value;
            updateEdgeWeights(links, link);
        });

        // initialize the first checkbox as checked
        d3.select('#chk-meta').property('checked', true);

        // Create the p-value slider container
        const pValueSlider = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '55px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label for="pvalue-slider">Select P-Value:</label>
                </div>
                <input id="pvalue-slider" type="range" min="0" max="8" step="1">
                <span id="pvalue-label">${pvalue}</span>
            `);

        // Define the discrete p-value options
        const pvalueOptions = ['1e-12', '1e-11', '1e-10', '1e-09', '1e-08', '1e-07', '1e-06', '1e-05', '1e-04'];
        // const pvalueOptions = ['1e-04', '1e-05', '1e-06', '1e-07', '1e-08', '1e-09', '1e-10', '1e-11', '1e-12'];

        // Event listener for the slider
        d3.select('#pvalue-slider').on('input', function () {
            const index = +this.value; // Get the slider's value as an index
            pvalue = pvalueOptions[index]; // Update the globally accessible pvalue variable
            d3.select('#pvalue-label').text(pvalue); // Update the displayed value
            // console.log(`P-Value selected: ${pvalue}`);
            updateEdgeWeights(links, link);
            // Add additional logic to handle changes in p-value selection if needed
        });

        // Initialize the slider to the last option (1e-04)
        const initialIndex = pvalueOptions.indexOf(pvalue);
        d3.select('#pvalue-slider').property('value', initialIndex);

        const edgeToggle = d3.select('body')
            .append('div')
            .style('position', 'absolute')
            .style('top', '100px')
            .style('left', '10px')
            .style('background', 'transparent')
            .style('padding', '10px')
            .style('color', 'white')
            .html(`
                <div>
                    <label>Select Edge Type:</label>
                </div>
                <div id="edge-checkboxes" style="border: 1px solid white; padding: 5px; max-width: 200px;">
                    <div><input type="checkbox" class="edge-option" value="weight" id="chk-weight"><label for="chk-weight">Weight</label></div>
                    <div><input type="checkbox" class="edge-option" value="same_dir_weight" id="chk-same"><label for="chk-same">Synergistic Weight</label></div>
                    <div><input type="checkbox" class="edge-option" value="diff_dir_weight" id="chk-diff"><label for="chk-diff">Antagonistic Weight</label></div>
                </div>
                <p style="font-size: 12px;">(Select one edge type)</p>
            `);

        // Enforce single-selection behavior like radio buttons
        d3.selectAll('.edge-option').on('change', function () {
            // Uncheck all checkboxes
            d3.selectAll('.edge-option').property('checked', false);
            // Check only the clicked one
            d3.select(this).property('checked', true);

            // Update edgeType variable
            edgeType = this.value;
            updateEdgeWeights(links, link);
        });

        // Initialize the first checkbox as checked
        d3.select('#chk-weight').property('checked', true);


        function updateEdgeWeights(links, link) {
            if (!ancestry || !pvalue || !edgeType) {
                console.warn('One or more variables (ancestry, pvalue, edgeType) are undefined.');
                return;
            }
        
            let columnName;
            if (edgeType === 'weight') {
                const sameDirColumn = `${ancestry}_${pvalue}_same_dir_weight`;
                const diffDirColumn = `${ancestry}_${pvalue}_diff_dir_weight`;
        
                // console.log("Checking links data structure:", links.slice(0, 5)); // Debug
                // console.log("Expected columns:", sameDirColumn, diffDirColumn); // Debug
        
                if (!links.some(d => d[sameDirColumn] !== undefined) || !links.some(d => d[diffDirColumn] !== undefined)) {
                    console.warn(`One or both columns "${sameDirColumn}" and "${diffDirColumn}" do not exist in links data.`);
                    return;
                }
        
                link.attr('stroke-width', d => {
                    const sameDirWeight = parseFloat(d[sameDirColumn]) || 0;
                    const diffDirWeight = parseFloat(d[diffDirColumn]) || 0;
                    return (sameDirWeight + diffDirWeight);
                });
        
                columnName = sameDirColumn; // Set for later use in degree calculation
            } else {
                columnName = `${ancestry}_${pvalue}_${edgeType}`;
                if (!links.some(d => d[columnName] !== undefined)) {
                    console.warn(`Column "${columnName}" does not exist in links data.`);
                    return;
                }
        
                link.attr('stroke-width', d => parseFloat(d[columnName]) || 0);
                
            }
        
            // Compute node degrees based on links
            const nodeDegrees = {};
            links.forEach(d => {
                const source = d.source;
                const target = d.target;
                const sameDirWeight = parseFloat(d[`${ancestry}_${pvalue}_same_dir_weight`]) || 0;
                const diffDirWeight = parseFloat(d[`${ancestry}_${pvalue}_diff_dir_weight`]) || 0;
            
                // If either weight is non-zero, count this link in the degree
                const hasEdge = (sameDirWeight !== 0 || diffDirWeight !== 0);
            
                if (!nodeDegrees[source]) nodeDegrees[source] = 0;
                if (!nodeDegrees[target]) nodeDegrees[target] = 0;
            
                if (hasEdge) {
                    nodeDegrees[source] += 1;
                    nodeDegrees[target] += 1;
                }
            });
        
            // console.log("Computed node degrees:", nodeDegrees); // Debugging step
        
            // Ensure labels are actually selected
            // console.log("Number of labels found:", svg.selectAll('.label').size());
        
            // Update labels to reflect the current degree values
            svg.selectAll('.label')
                .each(function(d) {
                    const degreeValue = nodeDegrees[d.id] || 0; // Use node ID to get its degree
        
                    // console.log(`Updating label for node ${d.id}: Degree = ${degreeValue}`); // Debug
        
                    d3.select(this).selectAll('tspan').remove(); // Clear existing tspans
        
                    d3.select(this)
                        .append('tspan')
                        .text(`Phenotype: ${d.label}`)
                        .attr('x', 0.01 * width)
                        .attr('dy', 0)
                        .attr('font-size', '20px');
        
                    d3.select(this)
                        .append('tspan')
                        .text(`Category: ${d.category}`)
                        .attr('x', 0.01 * width)
                        .attr('dy', '1.2em')
                        .attr('font-size', '20px');

                    d3.select(this)
                        .append('tspan')
                        .html('&bull;') // Using bullet character as a circle
                        .style('fill', d.hex) // Set the color from d.hex
                        .attr('dy', '0.3em')
                        .style('font-size', '80px'); // Match the font size
            
                    d3.select(this)
                        .append('tspan')
                        .text(`Degree under current filters: ${degreeValue}`)
                        .attr('x', 0.01 * width)
                        .attr('font-size', '20px')
                        .attr('dy', '0.4em');
                });
        
            // Redraw any visible labels
            svg.selectAll('.label')
                .each(function() {
                    if (d3.select(this).style('opacity') === '1') {
                        d3.select(this).style('opacity', 0);
                        d3.select(this).style('opacity', 1);
                    }
                });
        }
    
    // Add links to the SVG
    const link = content.selectAll('.link')
        .data(links, d => `${d.source}-${d.target}`)
        .join('line')
        .attr('class', 'link')
        .style('stroke', '#999')
        .style('opacity', 0)
        let activeNode = null;  // Store the currently active node reference
        let filteredNodes = nodes
        let filteredLinks = links
    updateEdgeWeights(links, link);

    const node = content.selectAll('.node')
        .data(nodes, d => d.id)
        .join('circle')
        .attr('class', 'node')
        .attr('r', d => d.size)
        .style('fill', d => d.color)
        // on mouseover give the node a bright outline
        .on('mouseover', function(event, d) {
            d3.select(this).style('stroke', 'white');
            d3.select(this).style('stroke-width', 2);
            // make the label opacity of the selected node 1
            labels.style('opacity', l => l.id === d.id ? 1 : 0);
            // console.log(d.id);
        })
        // on mouseout remove the outline
        .on('mouseout', function(event, d) {
            d3.select(this).style('stroke', 'none');
            // make the label opacity of the selected node 0
            labels.style('opacity', l => l.id === d.id ? 0 : 0);
        })
        .on('click', (event, d) => {
            console.log('Clicked node:', d);
            activeNode = d;
            highlightNode(d);
        });
            

// Define nodeDegrees outside of the link processing block to make it globally accessible
const nodeDegrees = {};

// Compute node degrees based on links
links.forEach(d => {
    const source = d.source;
    const target = d.target;
    const sameDirWeight = parseFloat(d[`${ancestry}_${pvalue}_same_dir_weight`]) || 0;
    const diffDirWeight = parseFloat(d[`${ancestry}_${pvalue}_diff_dir_weight`]) || 0;

    // If either weight is non-zero, count this link in the degree
    const hasEdge = (sameDirWeight !== 0 || diffDirWeight !== 0);

    if (!nodeDegrees[source]) nodeDegrees[source] = 0;
    if (!nodeDegrees[target]) nodeDegrees[target] = 0;

    if (hasEdge) {
        nodeDegrees[source] += 1;
        nodeDegrees[target] += 1;
    }
});

console.log("Computed node degrees:", nodeDegrees); // Debugging output

function highlightNode(selectedNode) {
    if (!selectedNode) {
        // Reset styles when no node is selected
        node.style('opacity', 1);  // Reset node opacity
        link.style('opacity', 0);  // Hide links
        labels.style('opacity', 0); // Hide labels

        // Restore original mouseover/mouseout behaviors
        node.on('mouseover', function(event, d) {
            d3.select(this).style('stroke', 'white').style('stroke-width', 2);
            labels.style('opacity', l => l.id === d.id ? 1 : 0);
        }).on('mouseout', function(event, d) {
            d3.select(this).style('stroke', 'none');
            labels.style('opacity', 0);
        });

        return;
    }

    const selectedNodeId = selectedNode.id;
    const neighbors = nodeNeighborsMap.get(selectedNodeId) || [];

    // Highlight only the selected node and its neighbors
    node.style('opacity', d =>
        (d.id === selectedNodeId || neighbors.includes(d.id)) && filteredNodes.includes(d)
            ? 1 : 0.2
    );

    // Highlight only the relevant links
    link.style('opacity', l =>
        filteredLinks.includes(l) &&
        ((l.source === selectedNodeId && nodeMap.has(l.target)) ||
         (l.target === selectedNodeId && nodeMap.has(l.source))) ? 1 : 0
    );

    // on double click (only on the selected node) open dendrogram.html in a new tab and pass the ancestry and pvalue variables
    // as query parameters
    node.on('dblclick', function (event, d) {
        // console.log('Double-clicked node:', d);
        console.log(nodeDegrees[d.id]);

        if (nodeDegrees[d.id] === undefined) {
            // warn the user that the node has no edges
            console.log('This node has no edges.');
            alert('This node has no edges.');
            return;
        }
        else { 
            console.log('Opening page2.html in a new tab...');
            window.open(`page2.html?ancestry=${ancestry}&pvalue=${pvalue}&centerPheno=${d.id}`);
            console.log('Double-clicked node:', d);
        }
    });

    // Add right-click context menu functionality
    node.on('contextmenu', function (event, d) {
        // clear any existing context menus
        d3.selectAll('.context-menu').remove();
        // if there is an active node:
        if (activeNode) {
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

            // Add "Open Sankey Diagram" option to the context menu
            contextMenu.append('div')
                .text('Open Edge View')
                .style('cursor', 'pointer')
                .style('padding', '5px')
                .on('click', function () {
                    // Open page3.html with selectedNode as leftPheno and the right-clicked node as rightPheno
                    window.open(`page3.html?ancestry=${ancestry}&pvalue=${pvalue}&leftPheno=${selectedNodeId}&rightPheno=${d.id}`);
                    contextMenu.remove(); // Remove the context menu after selection
                });

            // Close the context menu when clicking outside of it
            d3.select('body').on('click.context-menu', function () {
                contextMenu.remove();
                d3.select('body').on('click.context-menu', null); // Remove the event listener
            });
        }
    });

    // Restore mouseover events but only for highlighted nodes
    node.on('mouseover', function(event, d) {
        if (d.id === selectedNodeId || neighbors.includes(d.id)) {
            d3.select(this).style('stroke', 'white').style('stroke-width', 2);
            labels.style('opacity', l => l.id === d.id ? 1 : 0);
        }
    }).on('mouseout', function(event, d) {
        if (d.id === selectedNodeId || neighbors.includes(d.id)) {
            d3.select(this).style('stroke', 'none');
            labels.style('opacity', 0);
        }
    });
}

// Escape key event to clear selection
d3.select('body').on('keydown', function(event) {
    if (event.key === 'Escape') {
        activeNode = null;
        highlightNode(null); // Reset all highlighting
        content.selectAll('rect').remove();
    }
});


// console.log("Computed node degrees:", nodeDegrees); // Debugging output

// Add labels to the nodes
const labels = svg.selectAll('.label')
    .data(nodes)
    .enter()
    .append('text')
    .attr('class', 'label')
    .attr('dx', 0)
    .attr('dy', '.35em')
    .attr('font-size', '32px')
    .style('fill', 'white')  // Ensure text is visible against the black background
    .style('opacity', 0)
    .each(function(d) {
    // Use precomputed nodeDegrees instead of an incorrect column reference
    const degreeValue = nodeDegrees[d.id] || 0;


    // console.log(`Updating label for node ${d.id}: Degree = ${degreeValue}`); // Debugging output

    d3.select(this)
        .append('tspan')
        .text(`Phenotype: ${d.label}`)
        .attr('x', 0.01 * width)
        .attr('dy', 0)
        .attr('font-size', '20px');

    d3.select(this)
        .append('tspan')
        .text(`Category: ${d.category}`)
        .attr('x', 0.01 * width)
        .attr('dy', '1.2em')
        .attr('font-size', '20px'); 
        
    d3.select(this)
        .append('tspan')
        .html('&bull;') // Using bullet character as a circle
        .style('fill', d.hex) // Set the color from d.hex
        .attr('dy', '0.3em')
        .style('font-size', '80px'); // Match the font size

    d3.select(this)
        .append('tspan')
        .text(`Degree under current filters: ${degreeValue}`)
        .attr('x', 0.01 * width)
        .attr('font-size', '20px')
        .attr('dy', '0.4em');
});




// Set initial positions for nodes and links
link
    .attr('x1', d => nodes.find(node => node.id === d.source).x)
    .attr('y1', d => nodes.find(node => node.id === d.source).y)
    .attr('x2', d => nodes.find(node => node.id === d.target).x)
    .attr('y2', d => nodes.find(node => node.id === d.target).y);

node
    .attr('cx', d => d.x)
    .attr('cy', d => d.y);

labels
    .attr('x', d => 0)
    .attr('y', d => 0);

// recalculate positions so that no nodes are off the screen
// this is done by finding the min and max x and y values
// and then scaling all the x and y values so that they fit in the screen
const xValues = nodes.map(d => d.x);
const yValues = nodes.map(d => d.y);
const minX = Math.min(...xValues);
const maxX = Math.max(...xValues);
const minY = Math.min(...yValues);
const maxY = Math.max(...yValues);
const xScale = d3.scaleLinear().domain([minX, maxX]).range([0, width]);
const yScale = d3.scaleLinear().domain([minY, maxY]).range([0, height]);
node
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y));
labels
    .attr('x', d => 0.02 * width)
    .attr('y', d => 0.75 * height);
link
    .attr('x1', d => xScale(nodes.find(node => node.id === d.source).x))
    .attr('y1', d => yScale(nodes.find(node => node.id === d.source).y))
    .attr('x2', d => xScale(nodes.find(node => node.id === d.target).x))
    .attr('y2', d => yScale(nodes.find(node => node.id === d.target).y));
// now resize the nodes by dividing the size by the x range divided by the width
const xRange = maxX - minX;
const yRange = maxY - minY;
const xWidth = xRange / width;
const yHeight = yRange / height;
node
    .attr('r', d => d.size / yHeight / 1.1);

// Add zoom functionality
const zoom = d3.zoom()
    .scaleExtent([0.1, 10])
    .on('zoom', event => {
        content.attr('transform', event.transform);
    });

svg.call(zoom);

// Center and zoom in (1.2x) around graph center
const dataCenterX = (minX + maxX) / 2;
const dataCenterY = (minY + maxY) / 2;
const scaledCenterX = xScale(dataCenterX);
const scaledCenterY = yScale(dataCenterY);
// console.log(xRange, yRange)
const zoomLevel = 1.8;
const tx = width / 2 - scaledCenterX * zoomLevel +xRange / 100;
const ty = height / 2 - scaledCenterY * zoomLevel +yRange / 100;

svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(zoomLevel));

// SHOW WELCOME BOX if not dismissed before
if (!localStorage.getItem('welcomeDismissed')) {
  const welcomeBox = d3.select('body')
    .append('div')
    .attr('id', 'welcome-box')
    .style('position', 'absolute')
    .style('top', '50%')
    .style('left', '50%')
    .style('transform', 'translate(-50%, -50%)')
    .style('padding', '20px')
    .style('background', 'rgba(0, 0, 0, 0.9)')
    .style('color', 'white')
    .style('border-radius', '8px')
    .style('z-index', '1000')
    .style('line-height', '1.6')
    .style('text-align', 'center')
    .html(`
      <p style="margin-bottom: 16px; font-size: 20px;">Welcome to the website!</p>
        <p style="margin-bottom: 16px; font-size: 18px;">This is a visualization of the Million Veteran Program Phenotype Network.
        <br>Use the filters to explore different aspects of the network.</p>
      <p style="margin-bottom: 16px; font-size: 18px;">Click on a node to highlight its local network.
        <br>Double-click to see an expanded view of the SNPs connecting it to other phenotypes.
        <br>Once a node is selected, right-click on a connected node to open a detailed edge view.
        <br>Once a node is selected, click escape to exit back to the overall network view.</p>
      <div style="margin-bottom: 12px;">
        <label><input type="checkbox" id="dont-show-again"> Don't show this again</label>
      </div>
      <button id="close-welcome" style="
        padding: 6px 12px;
        border: none;
        background-color: #555;
        color: white;
        border-radius: 4px;
        cursor: pointer;
      ">Close</button>
    `);

  d3.select('#close-welcome').on('click', () => {
    if (document.getElementById('dont-show-again').checked) {
      localStorage.setItem('welcomeDismissed', 'true');
    }
    d3.select('#welcome-box').remove();
  });
}
        
    }).catch(error => {
        console.error('Error loading CSV files:', error);
    });

    // Handle window resizing to adjust SVG dimensions
    window.addEventListener('resize', () => {
        const newWidth = window.innerWidth;
        const newHeight = window.innerHeight;

        svg
            .attr('width', newWidth)
            .attr('height', newHeight);
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
    .text('About the network')
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
    .style('max-width', '1000px')
    .html(`
        <h2>Million Veteran Program Phenotype Network</h2>
        <p>
            This network illuminates the shared genetic basis of phenotypes within the VA's 
            Million Veteran Program (MVP). Each node is a phenotype, and each edge is made up
            of several genetic variants (SNPs). Each SNP in an edge is significantly assosciated 
            with both the source and target phenotypes, allowing us to easily find groups of
            genetically connected phenotypes.</p>
        <p>The thickness of an edge is proportional to the number of SNPs contained within it. If
            two phenotypes share 50 SNPs, that edge will be twice as thick as an edge between two  
            phenotypes that share only 25 SNPs</p>
        <p>The nodes are colored based on their category of phenotype. These categories come from the 
            phenotype's Phecode mapping. When we run a force-directed network layout we find that these 
            groups cluster together, indicating that this is a suitable method of assigning clusters of phenotypes 
        in the network.</p>
        <p>The filters can be used to look at certain conditions more closely. Because the gwPheWAS was 
            run on different ancestry subgroups within MVP, the ancestry filter can be used to look 
            at each of these subnetworks separately. </p>
        <p>In some cases we are interested only in SNPs that effect both of their assosciated phenotypes 
            in the same way (a synergistic association), or in SNPs that have opposite effects on their 
            associated phenotypes (an antagonistic association). The edge type filter can be used to compare 
            these cases</p>
        <p>The p-value slider sets the threshold for a SNP-phenotype association to be included in the network 
        <p>The degree filter can be used to eliminate phenotypes that don't have many connections</p>
        <p>Clicking a node reveals its "local network" by making its edges to other nodes visible. 
            This can be useful for exploring the network around a particular phenotype.</p>
        <p>While a node is selected, you can right click one of its neighboring nodes to see an expanded 
            view of the edge connecting the phenotypes. This is useful for looking at the individual 
            SNPs that make up an edge</p>
        <p>Double clicking a node opens a more detailed Node View. This is useful for exploring a 
        phenotypes specific relationship to its neighbors.</p>
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
        // redirect people to dropbox
        window.open('https://www.dropbox.com/scl/fo/214fw3kkq8qy8cyoey14y/AFy-u3ltk3sBKVSif4YfE_8?rlkey=f268undsc9qh0v5fcf6h9qkiy&st=nc1hh56k&dl=0', '_blank');

    });

    
});

