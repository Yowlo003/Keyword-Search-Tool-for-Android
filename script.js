document.addEventListener('DOMContentLoaded', () => {
    const directorySelector = document.getElementById('directory-selector');
    const searchBar = document.getElementById('search-bar');
    const fileList = document.getElementById('file-list');
    const directoryDisplay = document.getElementById('directory-display');
    const resultsCount = document.getElementById('results-count');
    const loadingIndicator = document.getElementById('loading-indicator');
    const emptyState = document.getElementById('empty-state');
    const clearSearchBtn = document.getElementById('clear-search');
    const compatibilityNotice = document.getElementById('compatibility-notice');
    
    let allFiles = [];
    let currentSearchID = 0;
    let searchTimeout = null;

    // Check browser compatibility
    checkBrowserCompatibility();

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
            'application/xml',
            'text/markdown',
            'application/javascript'
        ];
        
        // Check by MIME type
        if (textTypes.includes(file.type) || file.type === 'application/pdf') {
            return true;
        }
        
        // Check by file extension for files without proper MIME type
        const textExtensions = [
            '.txt', '.md', '.json', '.js', '.css', '.html', '.htm', 
            '.xml', '.csv', '.log', '.ini', '.cfg', '.conf', '.yaml', 
            '.yml', '.py', '.java', '.cpp', '.c', '.h', '.php', '.rb', 
            '.go', '.rs', '.kt', '.swift', '.sh', '.bat', '.sql'
        ];
        
        return textExtensions.some(ext => 
            file.name.toLowerCase().endsWith(ext)
        ) || file.name.endsWith('.pdf');
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
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + ' ';
                    }
                    resolve(fullText);
                } catch (error) {
                    console.error(`Error reading PDF ${file.name}:`, error);
                    reject(error);
                }
            };
            reader.onerror = reject;
        });
    };

    // Check browser compatibility for directory selection
    function checkBrowserCompatibility() {
        const isWebkitDirectorySupported = 'webkitdirectory' in document.createElement('input');
        
        if (!isWebkitDirectorySupported) {
            compatibilityNotice.classList.add('show');
        }
    }

    // Update directory display
    function updateDirectoryDisplay(fileCount, directoryName) {
        if (fileCount > 0) {
            directoryDisplay.innerHTML = `
                <div style="color: var(--primary-violet); font-weight: 500;">
                    📁 ${directoryName || 'Selected directory'}
                </div>
                <div style="color: var(--text-light); font-size: 0.85rem; margin-top: 4px;">
                    ${fileCount} files ready to search
                </div>
            `;
            directoryDisplay.classList.add('has-files');
        } else {
            directoryDisplay.innerHTML = '<span class="placeholder">No directory selected</span>';
            directoryDisplay.classList.remove('has-files');
        }
    }

    // Update results count
    function updateResultsCount(count, isSearching = false) {
        if (isSearching) {
            resultsCount.textContent = 'Searching...';
            return;
        }
        
        if (count === 0 && searchBar.value.trim() !== '') {
            resultsCount.textContent = 'No matches found';
        } else if (count === 1) {
            resultsCount.textContent = '1 file found';
        } else if (count > 1) {
            resultsCount.textContent = `${count} files found`;
        } else {
            resultsCount.textContent = '0 files found';
        }
    }

    // Show/hide loading indicator
    function setLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.classList.add('active');
        } else {
            loadingIndicator.classList.remove('active');
        }
    }

    // Show/hide empty state
    function setEmptyState(show, hasDirectory = true, hasKeyword = true) {
        if (show) {
            emptyState.classList.remove('hidden');
            fileList.style.display = 'none';
            
            if (!hasDirectory) {
                emptyState.innerHTML = `
                    <div class="empty-icon">📂</div>
                    <h3>Ready to search</h3>
                    <p>Select a directory and enter a keyword to begin searching through your files.</p>
                `;
            } else if (!hasKeyword) {
                emptyState.innerHTML = `
                    <div class="empty-icon">🔍</div>
                    <h3>Enter a keyword</h3>
                    <p>Type something in the search box to find matching files in your selected directory.</p>
                `;
            } else {
                emptyState.innerHTML = `
                    <div class="empty-icon">😕</div>
                    <h3>No matches found</h3>
                    <p>Try searching for a different keyword or select a different directory.</p>
                `;
            }
        } else {
            emptyState.classList.add('hidden');
            fileList.style.display = 'block';
        }
    }

    // Event listener for directory selection
    directorySelector.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        allFiles = files.filter(isSearchableFile);
        
        console.log(`Selected ${files.length} total files, ${allFiles.length} searchable files`);
        
        // Get directory name from first file's path
        const directoryName = files.length > 0 ? 
            files[0].webkitRelativePath?.split('/')[0] || 'Unknown directory' : 
            null;
        
        updateDirectoryDisplay(allFiles.length, directoryName);
        performSearch();
    });

    // Event listener for search bar input with debouncing
    searchBar.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(performSearch, 300);
    });

    // Clear search button
    clearSearchBtn.addEventListener('click', () => {
        searchBar.value = '';
        performSearch();
        searchBar.focus();
    });

    // Main search function
    const performSearch = async () => {
        const keyword = searchBar.value.toLowerCase().trim();
        const searchID = ++currentSearchID;

        // Clear previous results
        fileList.innerHTML = '';
        
        // Handle empty states
        if (allFiles.length === 0) {
            setEmptyState(true, false, true);
            updateResultsCount(0);
            setLoading(false);
            return;
        }

        if (keyword === '') {
            setEmptyState(true, true, false);
            updateResultsCount(0);
            setLoading(false);
            return;
        }

        // Start searching
        setLoading(true);
        updateResultsCount(0, true);
        setEmptyState(false);

        const matchingFiles = [];
        let processedCount = 0;

        try {
            // Process files in batches to prevent UI blocking
            const batchSize = 5;
            for (let i = 0; i < allFiles.length; i += batchSize) {
                // Check if search was cancelled
                if (searchID !== currentSearchID) {
                    return;
                }

                const batch = allFiles.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (file) => {
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
                    processedCount++;
                }));

                // Update progress
                if (searchID === currentSearchID) {
                    updateResultsCount(matchingFiles.length, true);
                }

                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Final update if search wasn't cancelled
            if (searchID === currentSearchID) {
                setLoading(false);
                
                if (matchingFiles.length === 0) {
                    setEmptyState(true, true, true);
                    updateResultsCount(0);
                } else {
                    setEmptyState(false);
                    updateResultsCount(matchingFiles.length);
                    
                    // Sort files by name for consistent ordering
                    matchingFiles.sort((a, b) => a.name.localeCompare(b.name));
                    
                    // Display results
                    matchingFiles.forEach(file => displayFile(file));
                }
            }
        } catch (error) {
            console.error('Search error:', error);
            setLoading(false);
            setEmptyState(true, true, true);
            updateResultsCount(0);
        }
    };

    // Function to display a single file in the list
    const displayFile = (file) => {
        const li = document.createElement('li');
        li.classList.add('file-item');

        const fileInfo = document.createElement('div');
        fileInfo.classList.add('file-info');

        const fileName = document.createElement('div');
        fileName.classList.add('file-name');
        fileName.textContent = file.name;

        const filePath = document.createElement('div');
        filePath.classList.add('file-path');
        filePath.textContent = file.webkitRelativePath || file.name;

        fileInfo.appendChild(fileName);
        fileInfo.appendChild(filePath);

        const openButton = document.createElement('button');
        openButton.classList.add('open-button');
        openButton.textContent = 'View';

        openButton.addEventListener('click', async () => {
            try {
                // Create a blob URL for the file
               const url = URL.createObjectURL(file);
               
               // Open in new tab/window
               const newWindow = window.open(url, '_blank');
               
               if (!newWindow) {
                   // Fallback: create a download link if popup was blocked
                   const link = document.createElement('a');
                   link.href = url;
                   link.download = file.name;
                   link.target = '_blank';
                   document.body.appendChild(link);
                   link.click();
                   document.body.removeChild(link);
               }
               
               // Clean up the URL after a delay
               setTimeout(() => URL.revokeObjectURL(url), 60000);
               
           } catch (error) {
               console.error(`Error opening file ${file.name}:`, error);
               alert('Unable to open file. Please try downloading it instead.');
           }
       });

       li.appendChild(fileInfo);
       li.appendChild(openButton);
       fileList.appendChild(li);
   };

   // Keyboard shortcuts
   document.addEventListener('keydown', (e) => {
       // Focus search bar with Ctrl+F or Cmd+F
       if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
           e.preventDefault();
           searchBar.focus();
           searchBar.select();
       }
       
       // Clear search with Escape
       if (e.key === 'Escape' && document.activeElement === searchBar) {
           searchBar.value = '';
           performSearch();
       }
   });

   // Initialize empty state
   setEmptyState(true, false, true);
});