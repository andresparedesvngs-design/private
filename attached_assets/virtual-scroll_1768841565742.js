class VirtualScroll {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('❌ Contenedor de scroll virtual no encontrado:', containerId);
            return;
        }
        
        this.options = {
            rowHeight: 70,  // Aumentado para coincidir con el CSS
            buffer: 8,      // Buffer aumentado
            ...options
        };
        
        this.state = {
            startIndex: 0,
            endIndex: 0,
            visibleRows: 0,
            totalRows: 0,
            renderedRows: new Set()
        };
        
        this.data = [];
        this.renderCallback = null;
        
        this._scrollHandler = this.handleScroll.bind(this);
        this._resizeHandler = this.handleResize.bind(this);
        
        this.initialize();
    }

    initialize() {
        if (!this.container) return;

        // Asegurar que el contenedor tenga las clases correctas
        this.container.classList.add('virtual-scroll-container');
        
        // Crear el contenido interno si no existe
        let contentElement = this.container.querySelector('.virtual-scroll-content');
        if (!contentElement) {
            contentElement = document.createElement('div');
            contentElement.className = 'virtual-scroll-content';
            this.container.appendChild(contentElement);
        }
        
        this.calculateVisibleRows();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.container.addEventListener('scroll', this._scrollHandler);
        window.addEventListener('resize', this._resizeHandler);
    }

    handleResize() {
        this.calculateVisibleRows();
        this.renderVisibleRows();
    }

    calculateVisibleRows() {
        const containerHeight = this.container.clientHeight;
        if (containerHeight === 0) {
            // Si aún no tiene altura, usar valores por defecto
            this.state.visibleRows = 20;
            return;
        }
        this.state.visibleRows = Math.ceil(containerHeight / this.options.rowHeight) + this.options.buffer * 2;
    }

    setData(data, renderCallback) {
        this.data = Array.isArray(data) ? data : [];
        this.state.totalRows = this.data.length;
        this.renderCallback = renderCallback;
        
        if (this.data.length === 0) {
            this.renderEmptyState();
        } else {
            this.handleScroll();
        }
    }

    handleScroll() {
        if (!this.data || this.data.length === 0) {
            this.renderEmptyState();
            return;
        }

        const scrollTop = this.container.scrollTop;
        this.state.startIndex = Math.max(0, Math.floor(scrollTop / this.options.rowHeight) - this.options.buffer);
        this.state.endIndex = Math.min(
            this.state.totalRows, 
            this.state.startIndex + this.state.visibleRows
        );
        
        this.renderVisibleRows();
    }

    renderVisibleRows() {
        const contentElement = this.container.querySelector('.virtual-scroll-content');
        if (!contentElement) {
            console.error('❌ Elemento .virtual-scroll-content no encontrado');
            return;
        }

        // Establecer altura total del contenedor
        const totalHeight = this.state.totalRows * this.options.rowHeight;
        contentElement.style.height = `${totalHeight}px`;
        contentElement.style.position = 'relative';
        contentElement.style.width = '100%';

        // Limpiar filas existentes
        const existingRows = contentElement.querySelectorAll('.virtual-scroll-item');
        existingRows.forEach(row => row.remove());

        // Renderizar filas visibles
        for (let i = this.state.startIndex; i < this.state.endIndex; i++) {
            const rowData = this.data[i];
            if (!rowData) continue;

            const row = document.createElement('div');
            row.className = `virtual-scroll-item ${i % 2 === 0 ? 'virtual-row-even' : 'virtual-row-odd'}`;
            row.style.position = 'absolute';
            row.style.top = `${i * this.options.rowHeight}px`;
            row.style.left = '0';
            row.style.width = '100%';
            row.style.height = `${this.options.rowHeight}px`;
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.boxSizing = 'border-box';
            row.setAttribute('data-index', i);
            row.setAttribute('role', 'row');

            if (this.renderCallback) {
                const rowHtml = this.renderCallback(rowData, i);
                row.innerHTML = rowHtml;
                
                // Asegurar que las celdas tengan la clase correcta
                const cells = row.querySelectorAll('div');
                cells.forEach((cell, cellIndex) => {
                    if (!cell.className.includes('virtual-cell') && !cell.className.includes('btn')) {
                        cell.classList.add('virtual-cell');
                    }
                });
            }

            contentElement.appendChild(row);
            this.state.renderedRows.add(i);
        }
    }

    renderEmptyState() {
        const contentElement = this.container.querySelector('.virtual-scroll-content');
        if (!contentElement) return;

        contentElement.style.height = 'auto';
        contentElement.innerHTML = `
            <div class="virtual-scroll-empty">
                <div class="empty-icon">📊</div>
                <p>No hay datos para mostrar</p>
                <small class="text-muted">Importa un archivo CSV o Excel para comenzar</small>
            </div>
        `;
    }

    updateRow(index, newData) {
        if (index < 0 || index >= this.data.length) {
            console.error('Índice fuera de rango:', index);
            return;
        }
        
        this.data[index] = newData;
        
        // Si la fila está actualmente visible, rerenderizarla
        const rowElement = this.container.querySelector(`.virtual-scroll-item[data-index="${index}"]`);
        if (rowElement && this.renderCallback) {
            rowElement.innerHTML = this.renderCallback(newData, index);
        }
    }

    refresh() {
        this.state.renderedRows.clear();
        this.calculateVisibleRows();
        this.handleScroll();
    }

    scrollToIndex(index) {
        if (index < 0 || index >= this.data.length) {
            console.error('Índice fuera de rango:', index);
            return;
        }
        
        const scrollTop = index * this.options.rowHeight;
        this.container.scrollTop = scrollTop;
    }

    getVisibleRange() {
        return {
            start: this.state.startIndex,
            end: this.state.endIndex,
            total: this.state.totalRows
        };
    }

    destroy() {
        if (this._scrollHandler) {
            this.container.removeEventListener('scroll', this._scrollHandler);
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
        
        const contentElement = this.container.querySelector('.virtual-scroll-content');
        if (contentElement) {
            contentElement.innerHTML = '';
        }
        
        this.state.renderedRows.clear();
        this.data = [];
    }
}

// Versión segura para instanciación
window.VirtualScroll = VirtualScroll;

// Función helper para instanciar fácilmente
window.initVirtualScroll = function(containerId, options = {}) {
    return new VirtualScroll(containerId, options);
};