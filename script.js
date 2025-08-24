document.addEventListener('DOMContentLoaded', () => {
    const directorySelector = document.getElementById('directory-selector');
    const searchBar = document.getElementById('search-bar');
    const fileList = document.getElementById('file-list');
    
    let allFiles = [];
    let currentSearchID = 0; // A variable to track the current search operation

    // Make the PDF.js worker available to the main thread
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

    // Check if a file is a text file or a PDF
    const isSearchableFile = (file) => {
        const textTypes = [
            'text/plain', 
            'text/html', 
            'text/css', 
            'text/javascript', 
            'application/json',
            'application/xml'
        ];
        return textTypes.includes(file.type) || file.type === 'application/pdf' || file.name.endsWith('.txt');
    };

    // Function to extract text from a PDF file
    const getPdfText = async (file) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);
        
        return new Promise((resolve, reject) => {
            reader.onload = async () => {
                const pdfData = new Uint8Array(reader.result);
                try {
                    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                    let fullText = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        fullText += textContent.items.map(item => item.str).join(' ');
                    }
                    resolve(fullText);
                } catch (error) {
                    console.error("Error reading PDF:", error);
                    reject(error);
                }
            };
            reader.onerror = reject;
        });
    };

    // Event listener for directory selection
    directorySelector.addEventListener('change', (event) => {
        allFiles = Array.from(event.target.files);
        performSearch();
    });

    // Event listener for search bar input
    searchBar.addEventListener('input', () => {
        performSearch();
    });

    // Main search function
    const performSearch = async () => {
        const keyword = searchBar.value.toLowerCase().trim();
        const searchID = ++currentSearchID; // Increment ID for new search

        fileList.innerHTML = ''; // Clear previous results

        if (keyword === '') {
            return;
        }

        const matchingFiles = [];
        const filesToProcess = allFiles.filter(file => isSearchableFile(file));

        for (const file of filesToProcess) {
            // Check if a new search has started. If so, stop processing.
            if (searchID !== currentSearchID) {
                return; 
            }

            try {
                let content = '';
                if (file.type === 'application/pdf') {
                    content = await getPdfText(file);
                } else {
                    content = await file.text();
                }

                if (content.toLowerCase().includes(keyword)) {
                    matchingFiles.push(file);
                }
            } catch (error) {
                console.error(`Error processing file ${file.name}:`, error);
            }
        }
        
        // Final check before displaying.
        if (searchID === currentSearchID) {
            // After all files have been processed, display only the matches
            matchingFiles.forEach(file => displayFile(file));
        }
    };

    // Function to display a single file in the list
    const displayFile = (file) => {
        const li = document.createElement('li');
        li.classList.add('file-item');

        const fileNameSpan = document.createElement('span');
        fileNameSpan.classList.add('file-name');
        fileNameSpan.textContent = file.name;

        const openButton = document.createElement('button');
        openButton.classList.add('open-button');
        openButton.textContent = 'Open';

        openButton.addEventListener('click', () => {
            console.log(`Open file requested: ${file.name}`);
        });

        li.appendChild(fileNameSpan);
        li.appendChild(openButton);
        fileList.appendChild(li);
    };
});
