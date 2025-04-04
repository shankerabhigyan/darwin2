import * as XLSX from 'xlsx';
import axios from 'axios';

// Constants for formatting and display
const MIN_VISIBLE_ROWS = 50;
const MIN_VISIBLE_COLS = 10;

const ClipboardHandler = {
  // Copy functionality
  handleCopy: (data, selectionStart, selectionEnd, activeCell) => {
    // If no selection, use active cell
    const startRow = selectionStart ? Math.min(selectionStart.row, selectionEnd.row) : activeCell.row;
    const endRow = selectionStart ? Math.max(selectionStart.row, selectionEnd.row) : activeCell.row;
    const startCol = selectionStart ? Math.min(selectionStart.col, selectionEnd.col) : activeCell.col;
    const endCol = selectionStart ? Math.max(selectionStart.col, selectionEnd.col) : activeCell.col;

    const selectedData = [];
    for (let i = startRow; i <= endRow; i++) {
      const row = [];
      for (let j = startCol; j <= endCol; j++) {
        row.push(data[i]?.[j] || '');
      }
      selectedData.push(row.join('\t'));
    }
    const copyText = selectedData.join('\n');
    
    return copyText;
  },

  // Cut functionality
  handleCut: (data, selectionStart, selectionEnd, activeCell) => {
    // First, get the data to copy
    const copyText = ClipboardHandler.handleCopy(data, selectionStart, selectionEnd, activeCell);
    
    // If no selection, use active cell
    const startRow = selectionStart ? Math.min(selectionStart.row, selectionEnd.row) : activeCell.row;
    const endRow = selectionStart ? Math.max(selectionStart.row, selectionEnd.row) : activeCell.row;
    const startCol = selectionStart ? Math.min(selectionStart.col, selectionEnd.col) : activeCell.col;
    const endCol = selectionStart ? Math.max(selectionStart.col, selectionEnd.col) : activeCell.col;

    const newData = [...data];
    for (let i = startRow; i <= endRow; i++) {
      for (let j = startCol; j <= endCol; j++) {
        if (newData[i]) {
          newData[i][j] = '';
        }
      }
    }
    
    return { newData, copyText };
  },

  // Paste functionality
  handlePaste: async (pasteData, activeCell, data) => {
    if (!activeCell) {
      console.log("No active cell selected for paste operation");
      return data;
    }

    console.log("Raw paste data:", pasteData.slice(0, 100) + "...");
    
    // Split by newline first
    const rows = pasteData.split(/[\r\n]+/).filter(row => row.trim() !== '');
    console.log(`Detected ${rows.length} rows in pasted data`);

    const startRow = activeCell.row;
    const startCol = activeCell.col;
    const newData = [...data];
    
    // Detect if data is tab-delimited or CSV
    const isTabDelimited = pasteData.includes('\t');
    console.log(`Data appears to be ${isTabDelimited ? 'tab-delimited' : 'comma-separated'}`);
    
    // Parse the pasted data
    rows.forEach((row, rowIndex) => {
      console.log(`Processing row ${rowIndex}: ${row.slice(0, 50)}...`);
      
      let cells;
      if (isTabDelimited) {
        // For tab-delimited data (from Excel, Google Sheets)
        cells = row.split('\t');
        console.log(`Split into ${cells.length} cells by tabs`);
      } else {
        // For CSV data, use a proper parser that respects quotes
        cells = [];
        let inQuote = false;
        let currentCell = '';
        
        // Parse CSV with proper quote handling
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          
          if (char === '"') {
            if (i + 1 < row.length && row[i + 1] === '"') {
              // Double quote inside quoted field = literal quote
              currentCell += '"';
              i++; // Skip the next quote
            } else {
              // Toggle quote state
              inQuote = !inQuote;
            }
          } else if (char === ',' && !inQuote) {
            // Comma outside quotes = field separator
            cells.push(currentCell);
            currentCell = '';
          } else {
            // Regular character
            currentCell += char;
          }
        }
        
        // Add the last cell
        cells.push(currentCell);
        console.log(`Split into ${cells.length} cells with CSV parsing`);
      }
      
      // Apply the parsed cells to the grid
      cells.forEach((cell, colIndex) => {
        const targetRow = startRow + rowIndex;
        const targetCol = startCol + colIndex;
        
        // Trim quotes from the beginning and end of the cell
        const trimmedCell = cell.replace(/^"|"$/g, '');
        
        // Ensure we have enough rows
        while (newData.length <= targetRow) {
          newData.push(Array(Math.max(newData[0]?.length || 0, targetCol + 1)).fill(''));
        }
        
        // Ensure we have enough columns in this row
        while (newData[targetRow].length <= targetCol) {
          newData[targetRow].push('');
        }
        
        console.log(`Setting cell [${targetRow},${targetCol}] to: ${trimmedCell.slice(0, 30)}...`);
        newData[targetRow][targetCol] = trimmedCell;
      });
    });
    
    return newData;
  },

  // File upload and parsing
  handleFileUpload: (file, setFileName, setHeaders, setData, setVisibleCols, generateColumnLabel) => {
    if (!file) return;
    
    setFileName(file.name);
    console.log(`Loading file: ${file.name}`);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      
      if (file.name.endsWith('.csv')) {
        console.log("Processing CSV file");
        
        // Use XLSX library for CSV parsing to handle quotes correctly
        try {
          const workbook = XLSX.read(content, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          console.log(`Parsed CSV with ${jsonData.length} rows`);
          if (jsonData.length > 0) {
            console.log(`First row has ${jsonData[0].length} columns`);
          }
          if (jsonData.length > 0) {
            // Generate column headers (A, B, C, etc.)
            const colCount = Math.max(
              MIN_VISIBLE_COLS,
              Math.max(...jsonData.map(row => row.length))
            );
            const newHeaders = Array.from({ length: colCount }, (_, i) => 
              generateColumnLabel(i)
            );
            
            // Ensure we have at least minimum rows
            const paddedData = [...jsonData];
            while (paddedData.length < MIN_VISIBLE_ROWS) {
              paddedData.push(Array(colCount).fill(''));
            }
            
            // Ensure each row has the same length
            const uniformData = paddedData.map(row => {
              if (row.length < colCount) {
                return [...row, ...Array(colCount - row.length).fill('')];
              }
              return row;
            });
            
            setHeaders(newHeaders);
            setData(uniformData);
            setVisibleCols(colCount);
          }
        } catch (error) {
          console.error('Error parsing CSV with XLSX:', error);
          
          // Fallback to parsing CSV with proper handling of quoted fields
          console.log("Falling back to manual CSV parsing");
          
          // This regex properly handles quoted fields with commas
          const parseCSVLine = (line) => {
            const result = [];
            let inQuotes = false;
            let currentField = '';
            
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              
              if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                  // Escaped quote
                  currentField += '"';
                  i++;
                } else {
                  // Toggle quote mode
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                // Field separator
                result.push(currentField);
                currentField = '';
              } else {
                // Regular character
                currentField += char;
              }
            }
            
            // Add the last field
            result.push(currentField);
            return result;
          };
          
          // Split into lines and parse each line
          const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
          const parsedData = lines.map(parseCSVLine);
          
          console.log(`Manually parsed CSV with ${parsedData.length} rows`);
          if (parsedData.length > 0) {
            console.log(`First row has ${parsedData[0].length} columns`);
          }
          
          if (parsedData.length > 0) {
            // Generate column headers (A, B, C, etc.)
            const colCount = Math.max(
              MIN_VISIBLE_COLS,
              Math.max(...parsedData.map(row => row.length))
            );
            const newHeaders = Array.from({ length: colCount }, (_, i) => 
              generateColumnLabel(i)
            );
            
            // Ensure we have at least minimum rows
            const paddedData = [...parsedData];
            while (paddedData.length < MIN_VISIBLE_ROWS) {
              paddedData.push(Array(colCount).fill(''));
            }
            
            // Ensure each row has the same length
            const uniformData = paddedData.map(row => {
              if (row.length < colCount) {
                return [...row, ...Array(colCount - row.length).fill('')];
              }
              return row;
            });
            
            setHeaders(newHeaders);
            setData(uniformData);
            setVisibleCols(colCount);
          }
        }
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Excel using xlsx library
        try {
          const workbook = XLSX.read(content, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length > 0) {
            // Generate column headers (A, B, C, etc.)
            const colCount = Math.max(
              MIN_VISIBLE_COLS,
              Math.max(...jsonData.map(row => row.length))
            );
            const newHeaders = Array.from({ length: colCount }, (_, i) => 
              generateColumnLabel(i)
            );
            
            // Ensure we have at least minimum rows
            const paddedData = [...jsonData];
            while (paddedData.length < MIN_VISIBLE_ROWS) {
              paddedData.push(Array(colCount).fill(''));
            }
            
            // Ensure each row has the same length
            const uniformData = paddedData.map(row => {
              if (row.length < colCount) {
                return [...row, ...Array(colCount - row.length).fill('')];
              }
              return row;
            });
            
            setHeaders(newHeaders);
            setData(uniformData);
            setVisibleCols(colCount);
          }
        } catch (error) {
          console.error('Error parsing Excel file:', error);
          alert('Error parsing Excel file. Please check the format.');
        }
      } else {
        alert('Unsupported file format. Please use CSV or Excel files.');
      }
    };
    
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  },

  // Save functionality
  handleSave: async (data, headers, fileName, token) => {
    try {
      const formattedData = data.map(row => {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || '';
        });
        return rowData;
      });
      
      // Send as a regular JSON object, not FormData
      const response = await axios.post(
        `${process.env.REACT_APP_API_URL}/api/records/`, 
        {
          data: formattedData,  // Send the array directly, not as a string
          file_name: fileName || 'Untitled Data'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(response);
      alert('Data saved successfully!');
      return true;
    } catch (err) {
      console.error(err);
      // Show more detailed error information
      const errorDetail = err.response?.data?.detail || err.message;
      alert(`Error saving data: ${errorDetail}`);
      return false;
    }
  }
};

export default ClipboardHandler;